"use client";

import { WORKFLOW_MODULES, type WorkflowModule } from "./workflowModules";
import type { WorkflowMode } from "@/lib/workflowClient";

interface PipelineOverviewProps {
  counts: Partial<Record<WorkflowModule, number>>;
  countLabels: Partial<Record<WorkflowModule, string>>;
  workflowMode: WorkflowMode;
  onOpenModule: (module: WorkflowModule) => void;
  selectedTopicTitle?: string | null;
  selectedDraftTitle?: string | null;
  /** 视频环节是否已渲染出成片 */
  videoRendered?: boolean;
}

export default function PipelineOverview({
  counts,
  countLabels,
  workflowMode,
  onOpenModule,
  selectedTopicTitle,
  selectedDraftTitle,
  videoRendered,
}: PipelineOverviewProps) {
  const isConnected = workflowMode === "connected";
  const producedCount = WORKFLOW_MODULES.filter((module) => (counts[module.id] ?? 0) > 0).length;
  const total = WORKFLOW_MODULES.length;
  const progress = Math.round((producedCount / total) * 100);

  // 推荐下一步：第一个还没产物的环节
  const nextModule = WORKFLOW_MODULES.find((module) => (counts[module.id] ?? 0) === 0);

  return (
    <section className="space-y-4">
      {/* 全局进度 */}
      <div className="rounded-xl border border-[#E5E5EA] bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A1A1A6]">
              Pipeline
            </div>
            <h2 className="mt-1 text-xl font-semibold text-[#1D1D1F]">内容生产流水线</h2>
            <p className="mt-1 text-sm text-[#6E6E73]">
              从采集到成片的 {total} 个环节一眼看全，点任意环节进入操作。
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-[#6E6E73]">
              <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-[#0A7F64]" : "bg-[#A1A1A6]"}`} />
              <span>{isConnected ? "Connected · 飞书已连接" : "Demo · 本地体验"}</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold tabular-nums text-[#1D1D1F]">
                {producedCount}
                <span className="text-base text-[#A1A1A6]">/{total}</span>
              </div>
              <div className="text-xs font-medium text-[#A1A1A6]">环节已有产物</div>
            </div>
          </div>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#F0F0F2]">
          <div
            className="h-full rounded-full bg-[#FF2442] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 当前内容包 + 推荐下一步 */}
      {(selectedTopicTitle || selectedDraftTitle || nextModule) && (
        <div className="flex flex-col gap-3 rounded-xl border border-[#E5E5EA] bg-[#FBFBFD] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#A1A1A6]">当前内容包</div>
            <div className="mt-1 truncate text-sm font-semibold text-[#1D1D1F]">
              {selectedDraftTitle || selectedTopicTitle || "尚未选择选题/草稿"}
            </div>
          </div>
          {nextModule && (
            <button
              type="button"
              onClick={() => onOpenModule(nextModule.id)}
              className="shrink-0 rounded-lg bg-[#FF2442] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(255,36,66,0.18)]"
            >
              下一步：{nextModule.label} →
            </button>
          )}
        </div>
      )}

      {/* 流程线 */}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-stretch gap-2">
          {WORKFLOW_MODULES.map((module, index) => {
            const count = counts[module.id] ?? 0;
            const produced = count > 0;
            const isNext = nextModule?.id === module.id;
            return (
              <div key={module.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => onOpenModule(module.id)}
                  className={`group flex w-[176px] flex-col rounded-xl border bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] ${
                    isNext ? "border-[#FF2442] ring-1 ring-[#FF2442]/30" : "border-[#E5E5EA]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold tabular-nums text-[#A1A1A6]">
                      {module.order}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${produced ? "bg-[#0A7F64]" : "bg-[#D2D2D7]"}`}
                    />
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-[#1D1D1F]">{module.label}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#A1A1A6]">
                    {module.description}
                  </p>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span
                      className={`text-lg font-semibold tabular-nums ${produced ? "text-[#1D1D1F]" : "text-[#D2D2D7]"}`}
                    >
                      {count}
                    </span>
                    <span className="text-xs font-medium text-[#A1A1A6]">
                      {countLabels[module.id] || ""}
                    </span>
                  </div>
                  {module.id === "video" && videoRendered && (
                    <span className="mt-2 inline-flex w-fit items-center rounded-full bg-[#0A7F64]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0A7F64]">
                      已成片
                    </span>
                  )}
                  <span className="mt-2 text-xs font-semibold text-[#FF2442] opacity-0 transition-opacity group-hover:opacity-100">
                    进入 →
                  </span>
                </button>
                {index < WORKFLOW_MODULES.length - 1 && (
                  <div className="flex items-center text-[#D2D2D7]" aria-hidden>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M7 4l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
