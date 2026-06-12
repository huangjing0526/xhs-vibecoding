"use client";

import { useState } from "react";
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
    <section className="border border-stone-950 bg-white">
      <div className="grid gap-0 lg:grid-cols-[1fr_auto]">
        <div className="border-b border-stone-200 p-4 lg:border-b-0 lg:border-r">
          {isDemo && missingCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">
                缺少 {missingCount} 项飞书配置
              </span>
            </div>
          )}

          <h2 className="mt-3 text-xl font-black leading-7 text-stone-950">
            {isDemo ? "先用样例跑完整闭环" : "从 3-6 条素材开始这一轮"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-stone-600">
            {isDemo
              ? "当前不会写入飞书；可以直接体验素材、选题、草稿和图片生成流程。"
              : "飞书已连接；建议先选同一主题下的少量素材，再生成更集中的选题。"}
          </p>

          {isDemo && missingCount > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {config?.missingFeishuConfig.slice(0, 6).map((name) => (
                <span key={name} className="border border-stone-200 bg-[#f8f6f1] px-2 py-1 text-[11px] font-semibold text-stone-500">
                  {name}
                </span>
              ))}
              {missingCount > 6 && (
                <span className="border border-stone-200 bg-[#f8f6f1] px-2 py-1 text-[11px] font-semibold text-stone-500">
                  +{missingCount - 6}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-2 p-4 sm:grid-cols-3 lg:w-[520px]">
          <button
            type="button"
            onClick={onUseDemo}
            className="border border-rose-600 bg-rose-600 px-3 py-3 text-sm font-black text-white transition-colors hover:bg-stone-950"
          >
            30 秒体验 Demo
          </button>
          <button
            type="button"
            onClick={isDemo ? onConnectFeishu : onOpenSource}
            className="border border-stone-950 bg-white px-3 py-3 text-sm font-black text-stone-950 transition-colors hover:bg-stone-950 hover:text-white"
          >
            {isDemo ? "尝试连接飞书" : "选择素材"}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="border border-stone-300 bg-white px-3 py-3 text-sm font-bold text-stone-600 transition-colors hover:border-stone-950 hover:text-stone-950"
          >
            收起
          </button>
        </div>
      </div>

      {isDemo && (
        <div className="grid gap-3 border-t border-stone-200 bg-[#f8f6f1] p-4 lg:grid-cols-[1fr_auto]">
          <textarea
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            rows={3}
            placeholder="也可以直接粘贴一段 Markdown"
            className="w-full resize-none border border-stone-300 bg-white px-3 py-2 text-sm font-semibold leading-6 text-stone-900 outline-none focus:border-stone-950"
          />
          <button
            type="button"
            onClick={() => onLoadMarkdown(markdown)}
            disabled={!markdown.trim()}
            className="border border-stone-950 bg-white px-4 py-3 text-sm font-black text-stone-950 transition-colors hover:bg-stone-950 hover:text-white disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400 lg:w-40"
          >
            载入 Markdown
          </button>
        </div>
      )}
    </section>
  );
}
