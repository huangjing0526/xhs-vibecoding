"use client";

import { useMemo, useState } from "react";
import { isPublishedDraft, type ContentCard, type DraftNote } from "@/lib/xhsWorkflow";

interface NoteListProps {
  notes: ContentCard[];
  drafts: DraftNote[];
  selectedTopicId: string | null;
  onSelect: (topic: ContentCard) => void;
  onNew: () => void;
  onGenerateFromMaterials: () => void;
}

export type NoteStatus = "待写" | "待发" | "已发";

/** 一篇笔记当前所处状态：没草稿=待写，有草稿未发=待发，已发布=已发。 */
export function getNoteStatus(topic: ContentCard, drafts: DraftNote[]): NoteStatus {
  const draft = drafts.find((item) => item.topicId === topic.topicId);
  if (!draft) return "待写";
  return isPublishedDraft(draft) ? "已发" : "待发";
}

const STATUS_STYLE: Record<NoteStatus, string> = {
  待写: "bg-[#FFF0F2] text-[#FF2442]",
  待发: "bg-[#FFF7E6] text-[#B7791F]",
  已发: "bg-[#0A7F64]/10 text-[#0A7F64]",
};

const FILTERS: Array<{ id: "all" | NoteStatus; label: string }> = [
  { id: "all", label: "全部" },
  { id: "待写", label: "待写" },
  { id: "待发", label: "待发" },
  { id: "已发", label: "已发" },
];

function noteTitle(topic: ContentCard): string {
  return topic.titleCandidates[0] || topic.coreViewpoint || "未命名笔记";
}

export default function NoteList({
  notes,
  drafts,
  selectedTopicId,
  onSelect,
  onNew,
  onGenerateFromMaterials,
}: NoteListProps) {
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<"all" | NoteStatus>("all");

  const decorated = useMemo(
    () => notes.map((topic) => ({ topic, status: getNoteStatus(topic, drafts) })),
    [notes, drafts]
  );

  const counts = useMemo(() => {
    const base: Record<"all" | NoteStatus, number> = { all: decorated.length, 待写: 0, 待发: 0, 已发: 0 };
    decorated.forEach(({ status }) => (base[status] += 1));
    return base;
  }, [decorated]);

  const visible = decorated.filter(({ topic, status }) => {
    if (filter !== "all" && status !== filter) return false;
    if (keyword.trim()) {
      const text = `${noteTitle(topic)} ${topic.painPoint} ${topic.coreViewpoint}`.toLowerCase();
      if (!text.includes(keyword.trim().toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="shrink-0 border-b border-[#E5E5EA] px-3 py-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#1D1D1F]">
            笔记 <span className="tabular-nums text-[#A1A1A6]">{notes.length}</span>
          </h2>
          <button
            type="button"
            onClick={onNew}
            className="rounded-md bg-[#1D1D1F] px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-black"
          >
            + 新建
          </button>
        </div>
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索笔记…"
          className="mt-2 w-full rounded-md border border-[#D2D2D7] bg-white px-2.5 py-1.5 text-sm text-[#1D1D1F] outline-none focus:border-[#1D1D1F]"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                filter === item.id ? "bg-[#1D1D1F] text-white" : "bg-[#F0F0F2] text-[#6E6E73] hover:bg-[#E5E5EA]"
              }`}
            >
              {item.label}
              <span className="ml-1 tabular-nums opacity-70">{counts[item.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-[#6E6E73]">
              {notes.length === 0 ? "还没有笔记。" : "没有符合条件的笔记。"}
            </p>
            {notes.length === 0 && (
              <button
                type="button"
                onClick={onGenerateFromMaterials}
                className="rounded-lg border border-[#D2D2D7] bg-white px-3 py-2 text-sm font-semibold text-[#1D1D1F] transition-colors hover:border-[#1D1D1F]"
              >
                去素材库生成选题 →
              </button>
            )}
          </div>
        ) : (
          visible.map(({ topic, status }) => {
            const active = selectedTopicId === topic.topicId;
            return (
              <button
                key={topic.recordId || topic.topicId}
                type="button"
                onClick={() => onSelect(topic)}
                className={`block w-full border-b border-[#F0F0F2] px-3 py-2.5 text-left transition-colors ${
                  active ? "bg-rose-50" : "hover:bg-[#F5F5F7]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${STATUS_STYLE[status]}`}>
                    {status}
                  </span>
                  <span className="truncate text-sm font-semibold text-[#1D1D1F]">{noteTitle(topic)}</span>
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-[#6E6E73]">{topic.painPoint || topic.coreViewpoint}</p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
