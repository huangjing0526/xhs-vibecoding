"use client";

import { useEffect, useState } from "react";
import type { ContentCard, DraftNote } from "@/lib/xhsWorkflow";
import type { WorkflowStage } from "./DashboardCards";

interface ContextDrawerProps {
  activeStage: WorkflowStage;
  selectedTopic: ContentCard | null;
  selectedDraft: DraftNote | null;
  coverDataUrl: string;
  contentImageDataUrl: string;
  imageMode: "cover" | "content";
  selectedMaterialsCount: number;
  primaryLabel: string;
  primaryDisabled: boolean;
  onPrimaryAction: () => void;
  onOpenStage: (stage: WorkflowStage) => void;
}

const STORAGE_KEY = "xhs-workflow:context-drawer-open";

function clip(text: string | undefined, maxLength = 92): string {
  if (!text) return "尚未确认";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function getTopicTitle(topic: ContentCard | null): string {
  if (!topic) return "尚未选择选题";
  return topic.titleCandidates?.[0] || topic.painPoint || topic.topicId || topic.recordId || "尚未选择选题";
}

function getDraftTitle(draft: DraftNote | null): string {
  if (!draft) return "尚未选择草稿";
  return draft.title || draft.noteId || draft.recordId || "尚未选择草稿";
}

export default function ContextDrawer({
  activeStage,
  selectedTopic,
  selectedDraft,
  coverDataUrl,
  contentImageDataUrl,
  imageMode,
  selectedMaterialsCount,
  primaryLabel,
  primaryDisabled,
  onPrimaryAction,
  onOpenStage,
}: ContextDrawerProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  }, [open]);

  const nextStageMap: Record<WorkflowStage, WorkflowStage> = {
    source: "topics",
    topics: "drafts",
    drafts: "covers",
    covers: "review",
    review: "source",
  };
  const nextStage = nextStageMap[activeStage];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 border border-stone-950 bg-stone-950 px-4 py-3 text-sm font-black text-white shadow-lg transition-transform hover:scale-105"
        aria-label={open ? "收起上下文" : "展开上下文"}
      >
        <span className="text-base leading-none">{open ? "›" : "‹"}</span>
        <span>上下文</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-20 bg-stone-950/20 backdrop-blur-sm xl:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed bottom-0 right-0 top-0 z-30 w-[320px] transform overflow-y-auto border-l border-stone-300 bg-[#f8f6f1] shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-stone-300 bg-white px-4 py-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-stone-400">Context</div>
            <h2 className="text-base font-black text-stone-950">当前内容包</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="border border-stone-300 px-3 py-1.5 text-xs font-black text-stone-600 hover:border-stone-950 hover:text-stone-950"
          >
            收起
          </button>
        </div>

        <div className="space-y-3 p-4">
          <section className="border border-stone-300 bg-white">
            <div className="space-y-0 divide-y divide-stone-100">
              <div className="p-3">
                <div className="text-xs font-black uppercase tracking-wider text-stone-400">本轮素材</div>
                <div className="mt-1 text-sm font-black leading-6 text-stone-950 tabular-nums">
                  {selectedMaterialsCount} 条
                </div>
              </div>
              <div className="p-3">
                <div className="text-xs font-black uppercase tracking-wider text-stone-400">当前选题</div>
                <div className="mt-1 text-sm font-black leading-6 text-stone-950">
                  {getTopicTitle(selectedTopic)}
                </div>
                {selectedTopic?.painPoint && (
                  <div className="mt-1.5 text-xs leading-5 text-stone-500">
                    痛点 · {clip(selectedTopic.painPoint, 60)}
                  </div>
                )}
                {selectedTopic?.reusableAsset && (
                  <div className="mt-1 text-xs leading-5 text-stone-500">
                    资产 · {clip(selectedTopic.reusableAsset, 60)}
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="text-xs font-black uppercase tracking-wider text-stone-400">当前草稿</div>
                <div className="mt-1 text-sm font-black leading-6 text-stone-950">
                  {getDraftTitle(selectedDraft)}
                </div>
              </div>
              <div className="p-3">
                <div className="text-xs font-black uppercase tracking-wider text-stone-400">图片</div>
                <div className="mt-1 text-xs font-semibold text-stone-600">
                  {imageMode === "content"
                    ? contentImageDataUrl ? "内容配图已生成" : "待生成内容配图"
                    : coverDataUrl ? "封面图已生成" : "待生成封面图"}
                </div>
              </div>
            </div>
          </section>

          <section className="bg-stone-950 p-3 text-white">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-stone-400">Next Action</div>
            <button
              type="button"
              onClick={onPrimaryAction}
              disabled={primaryDisabled}
              className="mt-2 w-full bg-rose-600 px-3 py-2 text-sm font-black text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-stone-800 disabled:text-stone-500"
            >
              {primaryLabel}
            </button>
            <button
              type="button"
              onClick={() => onOpenStage(nextStage)}
              className="mt-2 w-full px-3 py-2 text-sm font-bold text-stone-300 transition-colors hover:text-white"
            >
              跳到下一步 →
            </button>
          </section>
        </div>
      </aside>
    </>
  );
}
