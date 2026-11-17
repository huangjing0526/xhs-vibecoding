"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, LayoutTemplate } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import TemplateForm from "@/components/workflow/TemplateForm";
import TemplateGallery from "@/components/workflow/TemplateGallery";
import TemplateResult from "@/components/workflow/TemplateResult";
import { useAbortableTasks } from "@/components/workflow/useAbortableTasks";
import type { Notice } from "@/components/workflow/types";
// 只引表单工具，不引 registry——注册表留在服务端，理由见 lib/templates/inputs.ts
import { createEmptyInputValues } from "@/lib/templates/inputs";
import type { TemplateDefinition, TemplateInputValues, TemplatePack, TemplateRunResult } from "@/lib/templates/types";
import { isAbortError, listTemplates, runTemplate } from "@/lib/workflowClient";

const RUN_TASK_KEY = "templateRun";

/**
 * 模板区：画廊 → 参数 → 产出。
 *
 * 不依赖素材库/选题池——模板直达是新用户的入口（见 docs/template-library-plan.md 第 3 节），
 * 与既有管线的衔接只有结果页那一步，且可选。
 */
export default function TemplateStudio({ onNotice }: { onNotice: (notice: Notice) => void }) {
  const [packs, setPacks] = useState<TemplatePack[] | null>(null);
  const [selected, setSelected] = useState<TemplateDefinition | null>(null);
  const [values, setValues] = useState<TemplateInputValues>({});
  const [result, setResult] = useState<TemplateRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const tasks = useAbortableTasks();

  useEffect(() => {
    let cancelled = false;

    listTemplates()
      .then((data) => {
        if (!cancelled) setPacks(data.packs);
      })
      .catch((error) => {
        console.error("[TemplateStudio] 模板列表加载失败", {
          action: "template.list",
          error,
        });
        if (!cancelled) {
          setPacks([]);
          onNotice({
            type: "error",
            message: error instanceof Error ? error.message : "模板列表加载失败",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onNotice]);

  const handleSelect = useCallback((template: TemplateDefinition) => {
    setSelected(template);
    setValues(createEmptyInputValues(template));
    setResult(null);
  }, []);

  const handleBack = useCallback(() => {
    tasks.cancel(RUN_TASK_KEY);
    setRunning(false);
    setSelected(null);
    setResult(null);
  }, [tasks]);

  const handleRun = useCallback(async () => {
    if (!selected) return;

    setRunning(true);
    try {
      const data = await runTemplate({
        templateId: selected.id,
        values,
        signal: tasks.start(RUN_TASK_KEY),
      });
      setResult(data);
    } catch (error) {
      // 用户切走/重复点击导致的中止不是错误，静默收尾
      if (isAbortError(error)) return;
      console.error("[TemplateStudio] 模板生成失败", {
        action: "template.run",
        templateId: selected.id,
        error,
      });
      onNotice({
        type: "error",
        message: error instanceof Error ? error.message : "模板生成失败",
      });
    } finally {
      tasks.finish(RUN_TASK_KEY);
      setRunning(false);
    }
  }, [onNotice, selected, tasks, values]);

  if (!packs) {
    return <SkeletonText lines={6} />;
  }

  if (packs.length === 0) {
    return (
      <EmptyState
        icon={<LayoutTemplate size={22} />}
        title="没有可用的模板"
        description="模板注册表为空或加载失败，刷新页面重试。"
      />
    );
  }

  if (!selected) {
    return <TemplateGallery packs={packs} onSelect={handleSelect} />;
  }

  return (
    <div className="space-y-4">
      <Button size="sm" variant="ghost" icon={<ChevronLeft size={14} />} onClick={handleBack}>
        返回模板库
      </Button>

      <div className="grid gap-4 lg:grid-cols-2">
        <TemplateForm
          template={selected}
          values={values}
          onChange={setValues}
          onSubmit={handleRun}
          running={running}
        />

        {result ? (
          <TemplateResult
            template={selected}
            result={result}
            onRegenerate={handleRun}
            onNotice={onNotice}
            running={running}
          />
        ) : (
          <EmptyState
            icon={<LayoutTemplate size={22} />}
            title="填好左边的参数就能出图"
            description={selected.description}
          />
        )}
      </div>
    </div>
  );
}
