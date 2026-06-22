"use client";

import { useEffect, useState } from "react";
import type { ContentCard, DraftNote } from "@/lib/xhsWorkflow";

interface NoteEditorProps {
  selectedTopic: ContentCard | null;
  selectedDraft: DraftNote | null;
  boundDaokuName?: string;
  isGenerating: boolean;
  isSaving: boolean;
  onGenerateDraft: () => void;
  onSaveDraft: (draft: DraftNote) => void;
  onOpenRewrite: () => void;
}

/**
 * 中栏草稿编辑器：聚焦当前这一篇的写作。
 * 没草稿 → 一颗「生成草稿」；有草稿 → 标题/封面文案/正文可改，主按钮「保存」，旁挂「更像爆款」。
 */
export default function NoteEditor({
  selectedTopic,
  selectedDraft,
  boundDaokuName,
  isGenerating,
  isSaving,
  onGenerateDraft,
  onSaveDraft,
  onOpenRewrite,
}: NoteEditorProps) {
  const [form, setForm] = useState<DraftNote | null>(selectedDraft);

  useEffect(() => {
    setForm(selectedDraft);
  }, [selectedDraft]);

  const updateField = (field: "title" | "coverText" | "content", value: string) => {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  };

  if (!selectedTopic) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F5F5F7] p-8 text-center">
        <div>
          <p className="text-sm font-semibold text-[#1D1D1F]">从左侧选一篇笔记开始</p>
          <p className="mt-1 text-sm text-[#6E6E73]">或点左上「+ 新建」，也可去素材库从素材生成选题。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#F5F5F7]">
      <div className="shrink-0 border-b border-[#E5E5EA] bg-white px-5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-sm font-semibold text-[#6E6E73]">
            {selectedTopic.titleCandidates[0] || selectedTopic.coreViewpoint}
          </div>
          {boundDaokuName && (
            <span className="shrink-0 rounded-md bg-[#0A7F64]/10 px-2 py-0.5 text-xs font-semibold text-[#0A7F64]">
              道库 · {boundDaokuName}
            </span>
          )}
        </div>
      </div>

      {!form ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div>
            <p className="text-sm text-[#6E6E73]">这篇还没有草稿。一键生成后可直接改，或用「更像爆款」按对标博主打磨。</p>
            <button
              type="button"
              onClick={onGenerateDraft}
              disabled={isGenerating}
              className="mt-3 rounded-lg bg-[#FF2442] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#E01E3A] disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6]"
            >
              {isGenerating ? "生成中…" : "生成草稿"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            <div className="mx-auto max-w-2xl space-y-3">
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="标题"
                className="w-full bg-transparent text-2xl font-bold text-[#1D1D1F] outline-none placeholder:text-[#C7C7CC]"
              />
              <input
                value={form.coverText}
                onChange={(event) => updateField("coverText", event.target.value)}
                placeholder="封面文案"
                className="w-full rounded-md border border-[#E5E5EA] bg-white px-3 py-2 text-sm text-[#1D1D1F] outline-none focus:border-[#1D1D1F]"
              />
              <textarea
                value={form.content}
                onChange={(event) => updateField("content", event.target.value)}
                rows={18}
                placeholder="正文…"
                className="w-full resize-none rounded-md border border-[#E5E5EA] bg-white px-3 py-3 text-sm leading-7 text-[#1D1D1F] outline-none focus:border-[#1D1D1F]"
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-[#E5E5EA] bg-white px-5 py-2.5">
            <span className="text-xs tabular-nums text-[#A1A1A6]">{form.content.length} 字</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onGenerateDraft}
                disabled={isGenerating}
                className="rounded-lg border border-[#D2D2D7] bg-white px-3 py-2 text-sm font-semibold text-[#1D1D1F] transition-colors hover:bg-[#F5F5F7] disabled:cursor-not-allowed disabled:text-[#A1A1A6]"
              >
                {isGenerating ? "生成中…" : "重新生成"}
              </button>
              <button
                type="button"
                onClick={onOpenRewrite}
                className="rounded-lg border border-[#D2D2D7] bg-white px-3 py-2 text-sm font-semibold text-[#1D1D1F] transition-colors hover:bg-[#F5F5F7]"
              >
                更像爆款
              </button>
              <button
                type="button"
                onClick={() => form && onSaveDraft(form)}
                disabled={isSaving}
                className="rounded-lg bg-[#1D1D1F] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6]"
              >
                {isSaving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
