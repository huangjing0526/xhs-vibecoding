"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Check, Download, ImagePlus, Layers, Loader2, Pencil, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import TemplateThumb from "@/components/workflow/TemplateThumb";
import { useAbortableTasks } from "@/components/workflow/useAbortableTasks";
import { downloadImageAsset } from "@/lib/imageWorkflow";
import { generateImage, getImageProviders, isAbortError } from "@/lib/workflowClient";
import {
  BUILT_IN_IMAGE_TEMPLATES,
  IMAGE_FACTORY_STORAGE_KEY,
  type CliProviderStatus,
  type ImageCliProvider,
  IMAGE_TEMPLATE_THUMB_OPTIONS,
  type ImageFactoryTemplate,
  type ImageGenerationResult,
  type ImageTemplateThumb,
} from "@/lib/imageFactory";

const GENERATE_TASK_KEY = "imageFactory.generate";

interface SelectedInput {
  slotId: string;
  file: File;
  previewUrl: string;
}

function loadCustomTemplates(): ImageFactoryTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(IMAGE_FACTORY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[ImageFactory] 自建模板读取失败", { action: "imageFactory.loadTemplates", error });
    return [];
  }
}

function ProviderButton({
  provider,
  selected,
  onSelect,
}: {
  provider: CliProviderStatus;
  selected: boolean;
  onSelect: (provider: ImageCliProvider) => void;
}) {
  const enabled = provider.available && provider.authenticated;
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={() => onSelect(provider.id)}
      aria-pressed={selected}
      className={`rounded-2xl border p-3 text-left transition-all ${
        selected ? "border-brand-400 bg-brand-50 ring-2 ring-brand-100" : "border-line bg-surface"
      } ${enabled ? "hover:border-brand-300" : "cursor-not-allowed opacity-55"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink">{provider.name}</span>
        {enabled && <Check size={14} className="text-ok" />}
      </div>
      <p className="mt-1 text-[11px] leading-4 text-faint">{provider.message}</p>
    </button>
  );
}

/** 模板卡：示意图 + 名称 + 产出规格。自建模板的编辑/删除挂在卡片外层，避免按钮嵌套。 */
function TemplateCard({
  template,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: {
  template: ImageFactoryTemplate;
  selected: boolean;
  onSelect: (templateId: string) => void;
  onEdit: (template: ImageFactoryTemplate) => void;
  onDelete: (templateId: string) => void;
}) {
  const requiredCount = template.slots.filter((slot) => slot.required).length;
  const viewCount = template.views?.length || 0;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onSelect(template.id)}
        aria-pressed={selected}
        className={`w-full overflow-hidden rounded-2xl border text-left transition-all ${
          selected
            ? "border-brand-400 shadow-raised ring-2 ring-brand-100"
            : "border-line bg-surface hover:border-brand-300 hover:shadow-card"
        }`}
      >
        <div className="relative aspect-[4/3] border-b border-line">
          <TemplateThumb thumb={template.thumb} active={selected} />
          {selected && (
            <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white shadow-brand">
              <Check size={13} />
            </span>
          )}
        </div>
        <div className="p-3">
          <div className="flex items-center gap-1.5">
            <span className={`truncate text-sm font-bold ${selected ? "text-brand-700" : "text-ink"}`}>{template.name}</span>
            {!template.builtIn && <Badge tone="brand">自建</Badge>}
          </div>
          <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-faint">{template.description || "未填写用途说明"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="outline">{template.aspectRatio}</Badge>
            <Badge tone="neutral">{requiredCount} 张素材</Badge>
            {viewCount > 0 && <Badge tone="brand">{viewCount} 视图</Badge>}
          </div>
        </div>
      </button>
      {!template.builtIn && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => onEdit(template)}
            className="rounded-lg bg-surface p-1.5 text-faint shadow-card hover:text-ink"
            aria-label={`编辑${template.name}`}
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(template.id)}
            className="rounded-lg bg-surface p-1.5 text-faint shadow-card hover:text-danger"
            aria-label={`删除${template.name}`}
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ImageFactory() {
  const tasks = useAbortableTasks();
  const [customTemplates, setCustomTemplates] = useState<ImageFactoryTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(BUILT_IN_IMAGE_TEMPLATES[0].id);
  const [activeCategory, setActiveCategory] = useState(BUILT_IN_IMAGE_TEMPLATES[0].category);
  const [selectedInputs, setSelectedInputs] = useState<Record<string, SelectedInput>>({});
  const [selectedViewIds, setSelectedViewIds] = useState<string[]>([]);
  const [providers, setProviders] = useState<CliProviderStatus[]>([]);
  const [provider, setProvider] = useState<ImageCliProvider>("codex");
  const [customPrompt, setCustomPrompt] = useState("");
  const [results, setResults] = useState<ImageGenerationResult[]>([]);
  const [runTotal, setRunTotal] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<ImageFactoryTemplate | null>(null);

  const templates = useMemo(() => [...BUILT_IN_IMAGE_TEMPLATES, ...customTemplates], [customTemplates]);
  const categories = useMemo(() => {
    const ordered: string[] = [];
    templates.forEach((template) => {
      if (!ordered.includes(template.category)) ordered.push(template.category);
    });
    return ordered;
  }, [templates]);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || templates[0];
  const visibleTemplates = templates.filter((template) => template.category === activeCategory);

  const templateViews = selectedTemplate.views || [];
  const scenePresets = selectedTemplate.scenePresets || [];
  // 选中态直接由输入框内容反推：手改一个字就自动脱离选中，不用再维护一份状态
  const activeScenePresetId = scenePresets.find((preset) => preset.prompt === customPrompt)?.id || null;
  const activeViews = templateViews.filter((view) => selectedViewIds.includes(view.id));
  // 单图模板用一个 null 占位，走同一条生成循环
  const jobs = templateViews.length > 0 ? activeViews : [null];
  const plannedCount = jobs.length;
  const requiredReady = selectedTemplate.slots
    .filter((slot) => slot.required)
    .every((slot) => Boolean(selectedInputs[slot.id]));
  const selectedProvider = providers.find((item) => item.id === provider);
  const canGenerate =
    requiredReady && plannedCount > 0 && Boolean(selectedProvider?.available && selectedProvider.authenticated) && !isGenerating;
  const blockReason = !requiredReady ? "请先上传所有必传素材" : plannedCount === 0 ? "至少选择一个输出视图" : "";

  const refreshProviders = useCallback(async () => {
    setIsLoadingProviders(true);
    try {
      const { providers: nextProviders } = await getImageProviders();
      setProviders(nextProviders);
      // 用函数式更新读当前值，这样依赖数组能保持为空——否则点一下 CLI 卡片就会重新探测
      setProvider((current) => {
        if (nextProviders.find((item) => item.id === current)?.authenticated) return current;
        return nextProviders.find((item) => item.available && item.authenticated)?.id ?? current;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "CLI 状态检查失败");
    } finally {
      setIsLoadingProviders(false);
    }
  }, []);

  useEffect(() => {
    setCustomTemplates(loadCustomTemplates());
  }, []);

  useEffect(() => {
    refreshProviders();
  }, [refreshProviders]);

  // 卸载时统一回收预览用的 object URL；依赖数组必须为空，否则会撤销仍在用的地址
  const inputsRef = useRef(selectedInputs);
  inputsRef.current = selectedInputs;
  useEffect(() => () => {
    Object.values(inputsRef.current).forEach((input) => URL.revokeObjectURL(input.previewUrl));
  }, []);

  // 删掉最后一个自建模板会让当前分类消失，回落到第一个分类
  useEffect(() => {
    if (categories.length > 0 && !categories.includes(activeCategory)) setActiveCategory(categories[0]);
  }, [categories, activeCategory]);

  const selectTemplate = (templateId: string) => {
    const next = templates.find((template) => template.id === templateId);
    Object.values(selectedInputs).forEach((input) => URL.revokeObjectURL(input.previewUrl));
    setSelectedTemplateId(templateId);
    setSelectedInputs({});
    setSelectedViewIds(next?.views?.map((view) => view.id) || []);
    if (activeScenePresetId) setCustomPrompt("");
    setResults([]);
    setErrorMessage("");
  };

  const toggleView = (viewId: string) => {
    setSelectedViewIds((current) =>
      current.includes(viewId) ? current.filter((id) => id !== viewId) : [...current, viewId],
    );
  };

  const toggleScenePreset = (presetId: string) => {
    const preset = scenePresets.find((item) => item.id === presetId);
    if (!preset) return;
    setCustomPrompt((current) => current === preset.prompt ? "" : preset.prompt);
  };

  const selectInput = (slotId: string, file: File) => {
    setSelectedInputs((current) => {
      const previous = current[slotId];
      if (previous) URL.revokeObjectURL(previous.previewUrl);
      return { ...current, [slotId]: { slotId, file, previewUrl: URL.createObjectURL(file) } };
    });
    setResults([]);
  };

  const removeInput = (slotId: string) => {
    setSelectedInputs((current) => {
      const next = { ...current };
      if (next[slotId]) URL.revokeObjectURL(next[slotId].previewUrl);
      delete next[slotId];
      return next;
    });
  };

  const saveTemplate = (template: ImageFactoryTemplate) => {
    const next = customTemplates.some((item) => item.id === template.id)
      ? customTemplates.map((item) => item.id === template.id ? template : item)
      : [...customTemplates, template];
    setCustomTemplates(next);
    localStorage.setItem(IMAGE_FACTORY_STORAGE_KEY, JSON.stringify(next));
    setSelectedTemplateId(template.id);
    // 保存后直接选中这个模板，视图要跟着全选——否则新增/改完视图会停在「一个都没选」，
    // 也能顺带清掉编辑时被删掉的视图 id
    setSelectedViewIds(template.views?.map((view) => view.id) || []);
    setActiveCategory(template.category);
    setEditingTemplate(null);
  };

  const deleteTemplate = (templateId: string) => {
    const template = customTemplates.find((item) => item.id === templateId);
    if (!template || !window.confirm(`确认删除自定义模板“${template.name}”吗？`)) return;
    const next = customTemplates.filter((item) => item.id !== templateId);
    setCustomTemplates(next);
    localStorage.setItem(IMAGE_FACTORY_STORAGE_KEY, JSON.stringify(next));
    if (selectedTemplateId === templateId) selectTemplate(BUILT_IN_IMAGE_TEMPLATES[0].id);
  };

  /**
   * 多视图模板按视角串行发多次请求：出一张显示一张，中途可中止，
   * 也不用把后端改成长任务。单图模板走同一条路径，jobs 长度为 1。
   */
  const generate = async () => {
    const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const signal = tasks.start(GENERATE_TASK_KEY);
    const collected: ImageGenerationResult[] = [];

    setIsGenerating(true);
    setErrorMessage("");
    setResults([]);
    setRunTotal(jobs.length);

    try {
      for (const view of jobs) {
        const formData = new FormData();
        formData.set("provider", provider);
        formData.set("jobId", runId);
        formData.set("templateName", selectedTemplate.name);
        formData.set("templatePrompt", selectedTemplate.prompt);
        formData.set("customPrompt", customPrompt);
        formData.set("aspectRatio", selectedTemplate.aspectRatio);
        if (view) {
          formData.set("viewId", view.id);
          formData.set("viewLabel", view.label);
          formData.set("viewHint", view.hint);
        }
        selectedTemplate.slots.forEach((slot) => {
          const input = selectedInputs[slot.id];
          if (!input) return;
          formData.append("inputLabel", slot.label);
          formData.append("inputFile", input.file);
        });

        collected.push(await generateImage(formData, signal));
        setResults([...collected]);
      }
    } catch (error) {
      const aborted = isAbortError(error);
      console.error("[ImageFactory] 生成中断", {
        action: "imageFactory.generate",
        templateId: selectedTemplate.id,
        provider,
        runId,
        done: collected.length,
        total: jobs.length,
        error,
      });
      setErrorMessage(
        aborted
          ? `已中止，保留了先生成好的 ${collected.length} 张`
          : error instanceof Error ? error.message : "目标图生成失败",
      );
    } finally {
      tasks.finish(GENERATE_TASK_KEY);
      setIsGenerating(false);
    }
  };

  const downloadResult = (result: ImageGenerationResult) => {
    const viewPart = result.viewLabel ? `-${result.viewLabel}` : "";
    downloadImageAsset(result.imageDataUrl, `${selectedTemplate.name}${viewPart}-${result.jobId}${result.extension}`);
  };

  return (
    <div className="space-y-4">
      <Card flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold leading-tight text-ink">模板库</h2>
            <p className="mt-1 text-xs leading-5 text-faint">先选一个目标图结构，下面只需要传素材</p>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl
              value={activeCategory}
              options={categories.map((category) => ({ value: category, label: category }))}
              onChange={setActiveCategory}
              ariaLabel="模板分类"
              compact
            />
            <button
              type="button"
              onClick={() => setEditingTemplate({
                id: `custom-${Date.now().toString(36)}`,
                name: "新模板",
                category: "自建",
                description: "",
                prompt: "",
                aspectRatio: "1:1",
                slots: [{ id: "subject", label: "主体图", description: "", required: true }],
              })}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100"
              aria-label="新建模板"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visibleTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              selected={selectedTemplate.id === template.id}
              onSelect={selectTemplate}
              onEdit={setEditingTemplate}
              onDelete={deleteTemplate}
            />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.75fr)]">
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-ink">{selectedTemplate.name}</h2>
                  <Badge tone="outline">{selectedTemplate.aspectRatio}</Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted">{selectedTemplate.description}</p>
              </div>
              <span className="text-xs font-bold text-faint">
                {selectedTemplate.slots.filter((slot) => slot.required).length} 个必传素材
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {selectedTemplate.slots.map((slot) => {
                const input = selectedInputs[slot.id];
                return (
                  <div key={slot.id} className="relative overflow-hidden rounded-2xl border border-dashed border-line-strong bg-soft">
                    {input ? (
                      <div className="relative aspect-[4/3]">
                        <Image src={input.previewUrl} alt={`${slot.label}预览`} fill sizes="320px" className="object-cover" unoptimized />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 text-white">
                          <div className="text-xs font-bold">{slot.label}</div>
                          <div className="mt-0.5 truncate text-[10px] text-white/70">{input.file.name}</div>
                        </div>
                        <button type="button" onClick={() => removeInput(slot.id)} className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white" aria-label={`移除${slot.label}`}><X size={13} /></button>
                      </div>
                    ) : (
                      <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center p-5 text-center hover:bg-brand-50/50">
                        <ImagePlus size={22} className="text-faint" />
                        <span className="mt-2 text-sm font-bold text-ink">{slot.label}{slot.required && <span className="text-danger"> *</span>}</span>
                        <span className="mt-1 text-[11px] leading-4 text-faint">{slot.description}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) selectInput(slot.id, file);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>

            {templateViews.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <Layers size={14} className="text-faint" />
                    <h3 className="text-xs font-bold text-muted">输出视图</h3>
                  </div>
                  <span className="text-[11px] text-faint">本次出 {activeViews.length} 张，逐张生成</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {templateViews.map((view) => {
                    const checked = selectedViewIds.includes(view.id);
                    return (
                      <button
                        key={view.id}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggleView(view.id)}
                        title={view.hint}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                          checked
                            ? "border-brand-400 bg-brand-50 text-brand-700"
                            : "border-line bg-surface text-muted hover:border-brand-300 hover:text-ink"
                        }`}
                      >
                        {checked && <Check size={12} />}
                        {view.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <label className="block text-sm font-bold text-ink" htmlFor="image-factory-prompt">补充生成要求</label>
            {scenePresets.length > 0 && (
              <div className="mt-3 rounded-2xl bg-soft p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold text-muted">画面场景</h3>
                  <span className="text-[11px] text-faint">点选替换下方内容，可继续手改</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {scenePresets.map((preset) => {
                    const checked = activeScenePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => toggleScenePreset(preset.id)}
                        title={preset.prompt}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                          checked
                            ? "border-brand-400 bg-brand-50 text-brand-700"
                            : "border-line bg-surface text-muted hover:border-brand-300 hover:text-ink"
                        }`}
                      >
                        {checked && <Check size={12} />}
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <textarea
              id="image-factory-prompt"
              value={customPrompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
              rows={4}
              placeholder="例如：背景改成日落海边，人物自然站立，画面不要文字……"
              className="mt-2 w-full resize-y rounded-2xl border border-line bg-soft px-3.5 py-3 text-sm leading-6 text-ink outline-none transition focus:border-brand-300 focus:bg-surface"
            />
            <details className="mt-3 rounded-2xl bg-soft px-3.5 py-3 text-xs">
              <summary className="cursor-pointer font-bold text-muted">查看模板生成规则</summary>
              <p className="mt-2 leading-5 text-faint">{selectedTemplate.prompt}</p>
            </details>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-ink">本地生成引擎</h2>
                <p className="mt-0.5 text-[11px] text-faint">使用已登录 CLI 的订阅额度</p>
              </div>
              <button type="button" onClick={refreshProviders} disabled={isLoadingProviders} className="rounded-xl p-2 text-faint hover:bg-soft hover:text-ink" aria-label="刷新CLI状态">
                <RefreshCw size={15} className={isLoadingProviders ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {providers.map((item) => <ProviderButton key={item.id} provider={item} selected={provider === item.id} onSelect={setProvider} />)}
              {isLoadingProviders && providers.length === 0 && (
                <div className="flex items-center gap-2 rounded-2xl bg-soft p-4 text-xs text-faint"><Loader2 size={14} className="animate-spin" />正在检查本机 CLI</div>
              )}
            </div>
            <Button
              block
              size="lg"
              variant="ai"
              className="mt-4"
              disabled={!canGenerate}
              loading={isGenerating}
              onClick={generate}
              icon={<Sparkles size={16} />}
            >
              {isGenerating
                ? `正在生成第 ${Math.min(results.length + 1, runTotal)}/${runTotal} 张`
                : plannedCount > 1 ? `生成 ${plannedCount} 张目标图` : "生成目标图"}
            </Button>
            {isGenerating && (
              <button
                type="button"
                onClick={() => tasks.cancel(GENERATE_TASK_KEY)}
                className="mt-2 w-full rounded-xl py-1.5 text-xs font-bold text-faint hover:text-danger"
              >
                中止生成
              </button>
            )}
            {blockReason && <Callout tone="warn" className="mt-2 text-center">{blockReason}</Callout>}
            {errorMessage && <p className="mt-3 rounded-2xl bg-danger/10 px-3 py-2 text-xs leading-5 text-danger">{errorMessage}</p>}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-ink">目标图</h2>
                <p className="mt-0.5 text-[11px] text-faint">生成结果同时保存在本机任务目录</p>
              </div>
              {results.length > 1 && (
                <button
                  type="button"
                  onClick={() => results.forEach(downloadResult)}
                  className="rounded-xl px-2.5 py-2 text-xs font-bold text-brand-600 hover:bg-brand-50"
                >
                  下载全部
                </button>
              )}
            </div>

            {results.length > 0 ? (
              <div className={`mt-4 grid gap-3 ${results.length > 1 ? "sm:grid-cols-2" : ""}`}>
                {results.map((result) => (
                  <div key={`${result.jobId}-${result.viewId || "single"}`} className="group">
                    <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-soft">
                      <Image src={result.imageDataUrl} alt={result.viewLabel || "AI 生成的目标图"} fill sizes="320px" className="object-contain" unoptimized />
                      <button
                        type="button"
                        onClick={() => downloadResult(result)}
                        className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                        aria-label={`下载${result.viewLabel || "目标图"}`}
                      >
                        <Download size={13} />
                      </button>
                    </div>
                    {result.viewLabel && <p className="mt-1.5 text-center text-[11px] font-bold text-muted">{result.viewLabel}</p>}
                  </div>
                ))}
                {isGenerating && results.length < runTotal && (
                  <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-line-strong bg-soft text-faint">
                    <Loader2 size={22} className="animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <div className="relative mt-4 flex min-h-72 items-center justify-center overflow-hidden rounded-2xl border border-line bg-soft">
                {isGenerating ? (
                  <div className="text-center text-faint">
                    <Loader2 size={24} className="mx-auto animate-spin" />
                    <p className="mt-3 text-xs font-bold">CLI 正在生成图片</p>
                    <p className="mt-1 text-[11px]">可以保留此页面等待结果</p>
                  </div>
                ) : (
                  <div className="text-center text-faint"><ImagePlus size={26} className="mx-auto" /><p className="mt-3 text-xs font-bold">生成后在这里预览</p></div>
                )}
              </div>
            )}
            {results.length > 0 && (
              <p className="mt-2 break-all font-mono text-[10px] leading-4 text-faint">
                {results.length > 1 ? results[0].runDir : results[0].outputPath}
              </p>
            )}
          </Card>
        </div>
      </div>

      {editingTemplate && (
        <TemplateEditor
          template={editingTemplate}
          categories={categories}
          onCancel={() => setEditingTemplate(null)}
          onSave={saveTemplate}
        />
      )}
    </div>
  );
}

const EDITOR_FIELD = "min-w-0 rounded-xl border border-line bg-surface px-2.5 py-2 text-xs text-ink";

function newRowId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 槽位 / 视图 / 场景三段结构一样，抽出来避免三份重复的增删壳子。 */
function EditorSection({
  title,
  hint,
  addLabel,
  onAdd,
  empty,
  children,
}: {
  title: string;
  hint: string;
  addLabel: string;
  onAdd: () => void;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold text-muted">
          {title}
          <span className="ml-2 font-normal text-faint">{hint}</span>
        </h3>
        <button type="button" onClick={onAdd} className="shrink-0 text-xs font-bold text-brand-600">{addLabel}</button>
      </div>
      <div className="mt-2 space-y-2">
        {empty ? <p className="rounded-2xl bg-soft px-3 py-2.5 text-[11px] text-faint">还没有条目，可以不填</p> : children}
      </div>
    </div>
  );
}

function EditorRow({
  cols,
  label,
  onRemove,
  children,
}: {
  cols: string;
  label: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-soft p-2">
      <div className={`grid min-w-0 flex-1 gap-2 ${cols}`}>{children}</div>
      <button type="button" onClick={onRemove} className="shrink-0 rounded-xl p-2 text-faint hover:text-danger" aria-label={`删除${label}`}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function TemplateEditor({
  template,
  categories,
  onCancel,
  onSave,
}: {
  template: ImageFactoryTemplate;
  categories: string[];
  onCancel: () => void;
  onSave: (template: ImageFactoryTemplate) => void;
}) {
  const [draft, setDraft] = useState(template);
  const views = draft.views || [];
  const presets = draft.scenePresets || [];

  const patch = (next: Partial<ImageFactoryTemplate>) => setDraft((current) => ({ ...current, ...next }));
  const replaceAt = <T,>(list: T[], index: number, next: Partial<T>): T[] =>
    list.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));

  // 空列表存成 undefined，和内置模板「不填即没有」的形态保持一致
  const submit = () => onSave({
    ...draft,
    views: views.length > 0 ? views : undefined,
    scenePresets: presets.length > 0 ? presets : undefined,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="编辑图片模板">
      <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-3xl bg-surface p-5 shadow-pop">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">自建模板</h2>
          <button type="button" onClick={onCancel} className="rounded-xl p-2 text-faint hover:bg-soft hover:text-ink" aria-label="关闭"><X size={17} /></button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-muted">模板名称 *<input value={draft.name} onChange={(event) => patch({ name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink" /></label>
          <label className="text-xs font-bold text-muted">
            所属分类
            <input
              value={draft.category}
              onChange={(event) => patch({ category: event.target.value })}
              list="image-factory-categories"
              className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink"
            />
            <datalist id="image-factory-categories">
              {categories.map((category) => <option key={category} value={category} />)}
            </datalist>
          </label>
          <label className="text-xs font-bold text-muted">输出比例<input value={draft.aspectRatio} onChange={(event) => patch({ aspectRatio: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink" /></label>
          <label className="text-xs font-bold text-muted">
            卡片示意图
            <select
              value={draft.thumb || ""}
              onChange={(event) => patch({ thumb: event.target.value ? (event.target.value as ImageTemplateThumb) : undefined })}
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink"
            >
              <option value="">通用图标</option>
              {IMAGE_TEMPLATE_THUMB_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-muted sm:col-span-2">用途说明<input value={draft.description} onChange={(event) => patch({ description: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink" /></label>
          <label className="text-xs font-bold text-muted sm:col-span-2">
            生成规则 *
            <span className="ml-2 font-normal text-faint">写清楚：保持什么 / 默认什么 / 禁止什么</span>
            <textarea value={draft.prompt} onChange={(event) => patch({ prompt: event.target.value })} rows={5} className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm leading-6 text-ink" />
          </label>
        </div>

        <EditorSection
          title="上传槽位"
          hint="勾选即必传"
          addLabel="+ 添加槽位"
          empty={draft.slots.length === 0}
          onAdd={() => patch({ slots: [...draft.slots, { id: newRowId("slot"), label: "参考图", description: "", required: true }] })}
        >
          {draft.slots.map((slot, index) => (
            <EditorRow
              key={slot.id}
              cols="grid-cols-[1fr_1.6fr_auto]"
              label={slot.label}
              onRemove={() => patch({ slots: draft.slots.filter((_, slotIndex) => slotIndex !== index) })}
            >
              <input value={slot.label} onChange={(event) => patch({ slots: replaceAt(draft.slots, index, { label: event.target.value }) })} placeholder="槽位名称" className={EDITOR_FIELD} />
              <input value={slot.description} onChange={(event) => patch({ slots: replaceAt(draft.slots, index, { description: event.target.value }) })} placeholder="图片用途" className={EDITOR_FIELD} />
              <label className="flex shrink-0 items-center gap-1.5 px-1 text-[11px] font-bold text-muted">
                <input type="checkbox" checked={slot.required} onChange={(event) => patch({ slots: replaceAt(draft.slots, index, { required: event.target.checked }) })} className="h-3.5 w-3.5 accent-brand-500" />
                必传
              </label>
            </EditorRow>
          ))}
        </EditorSection>

        <EditorSection
          title="输出视图"
          hint="填了就一次出多张，逐张生成"
          addLabel="+ 添加视图"
          empty={views.length === 0}
          onAdd={() => patch({ views: [...views, { id: newRowId("view"), label: "新视角", hint: "" }] })}
        >
          {views.map((view, index) => (
            <EditorRow
              key={view.id}
              cols="grid-cols-[1fr_1.6fr]"
              label={view.label}
              onRemove={() => patch({ views: views.filter((_, viewIndex) => viewIndex !== index) })}
            >
              <input value={view.label} onChange={(event) => patch({ views: replaceAt(views, index, { label: event.target.value }) })} placeholder="视角名称" className={EDITOR_FIELD} />
              <input value={view.hint} onChange={(event) => patch({ views: replaceAt(views, index, { hint: event.target.value }) })} placeholder="这个视角要拍成什么样" className={EDITOR_FIELD} />
            </EditorRow>
          ))}
        </EditorSection>

        <EditorSection
          title="画面场景"
          hint="点选后写进补充要求，只写场景不写商品"
          addLabel="+ 添加场景"
          empty={presets.length === 0}
          onAdd={() => patch({ scenePresets: [...presets, { id: newRowId("scene"), label: "新场景", prompt: "" }] })}
        >
          {presets.map((preset, index) => (
            <EditorRow
              key={preset.id}
              cols="grid-cols-[1fr_1.6fr]"
              label={preset.label}
              onRemove={() => patch({ scenePresets: presets.filter((_, presetIndex) => presetIndex !== index) })}
            >
              <input value={preset.label} onChange={(event) => patch({ scenePresets: replaceAt(presets, index, { label: event.target.value }) })} placeholder="标签名" className={EDITOR_FIELD} />
              <input value={preset.prompt} onChange={(event) => patch({ scenePresets: replaceAt(presets, index, { prompt: event.target.value }) })} placeholder="30-60 字的画面描述" className={EDITOR_FIELD} />
            </EditorRow>
          ))}
        </EditorSection>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button variant="primary" disabled={!draft.name.trim() || !draft.prompt.trim()} onClick={submit}>保存模板</Button>
        </div>
      </div>
    </div>
  );
}
