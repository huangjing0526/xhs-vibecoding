"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import type { WorkflowBootstrapResult, WorkflowMode } from "@/lib/workflowClient";

interface WorkflowOnboardingProps {
  mode: WorkflowMode;
  config: WorkflowBootstrapResult["config"] | null;
  onUseDemo: () => void;
  onLoadMarkdown: (markdown: string) => void;
  onConnectFeishu: () => void;
  onOpenSource: () => void;
  onDismiss: () => void;
}

/** 首屏引导卡：一句话说清这一轮从哪开始，右侧给一个主操作 + 两个次操作。 */
export default function WorkflowOnboarding({
  mode,
  config,
  onUseDemo,
  onLoadMarkdown,
  onConnectFeishu,
  onOpenSource,
  onDismiss,
}: WorkflowOnboardingProps) {
  const [markdown, setMarkdown] = useState("");
  const isDemo = mode === "demo";
  const missingCount = config?.missingFeishuConfig.length || 0;

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          {isDemo && missingCount > 0 && <Badge tone="warn">缺少 {missingCount} 项飞书配置</Badge>}

          <h2 className="mt-2 font-rounded text-xl font-bold leading-7 text-ink">
            {isDemo ? "先用样例跑完整闭环" : "从 3-6 条素材开始这一轮"}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">
            {isDemo
              ? "当前不会写入飞书；可以直接体验素材、选题、草稿和图片生成流程。"
              : "飞书已连接；建议先选同一主题下的少量素材，再生成更集中的选题。"}
          </p>

          {isDemo && missingCount > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {config?.missingFeishuConfig.slice(0, 6).map((name) => (
                <span
                  key={name}
                  className="rounded-lg bg-soft px-2 py-1 font-mono text-[11px] font-semibold text-faint"
                >
                  {name}
                </span>
              ))}
              {missingCount > 6 && (
                <span className="rounded-lg bg-soft px-2 py-1 text-[11px] font-semibold text-faint">
                  +{missingCount - 6}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="ai" size="lg" onClick={onUseDemo}>
            30 秒体验 Demo
          </Button>
          <Button variant="secondary" size="lg" onClick={isDemo ? onConnectFeishu : onOpenSource}>
            {isDemo ? "尝试连接飞书" : "选择素材"}
          </Button>
          <Button variant="ghost" size="lg" onClick={onDismiss}>
            收起
          </Button>
        </div>
      </div>

      {isDemo && (
        <div className="flex flex-col gap-3 border-t border-line bg-soft p-5 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-xs font-bold text-muted">粘贴 Markdown</span>
            <Textarea
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              rows={3}
              placeholder="贴一段日报或问题记录，直接当素材载入"
              className="bg-surface"
            />
          </label>
          <Button variant="secondary" size="lg" onClick={() => onLoadMarkdown(markdown)} disabled={!markdown.trim()}>
            载入 Markdown
          </Button>
        </div>
      )}
    </section>
  );
}
