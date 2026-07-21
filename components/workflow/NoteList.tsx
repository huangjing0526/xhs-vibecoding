"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Field";
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

const STATUS_TONE: Record<NoteStatus, BadgeTone> = {
  待写: "brand",
  待发: "warn",
  已发: "ok",
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

function compactMeta(topic: ContentCard): string[] {
  return [
    topic.contentLane,
    topic.referencePool,
    topic.viralTitleStructure,
    topic.assetType,
  ].filter(Boolean) as string[];
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
    <div className="flex h-full flex-col bg-surface">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-ink">
            笔记 <span className="font-rounded tabular-nums text-faint">{notes.length}</span>
          </h2>
          <Button size="sm" variant="primary" onClick={onNew} icon={<Plus size={14} strokeWidth={2.6} />}>
            新建
          </Button>
        </div>

        <div className="relative mt-2.5">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索笔记"
            className="pl-9"
          />
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
                filter === item.id ? "bg-ink text-white" : "bg-soft text-muted hover:bg-sunken"
              }`}
            >
              {item.label}
              <span className="ml-1 font-rounded tabular-nums opacity-70">{counts[item.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-3">
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted">{notes.length === 0 ? "还没有笔记" : "没有符合条件的笔记"}</p>
            {notes.length === 0 && (
              <Button variant="secondary" size="sm" onClick={onGenerateFromMaterials}>
                去素材库生成选题
              </Button>
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
                className={`block w-full rounded-2xl px-3 py-2.5 text-left transition-colors ${
                  active ? "bg-brand-50 ring-1 ring-inset ring-brand-200" : "hover:bg-soft"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                  <span className="truncate text-sm font-bold text-ink">{noteTitle(topic)}</span>
                </div>
                <p className="mt-1 line-clamp-1 text-xs leading-5 text-muted">
                  {topic.painPoint || topic.coreViewpoint}
                </p>
                {compactMeta(topic).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {compactMeta(topic).map((item) => (
                      <span
                        key={`${topic.topicId}-${item}`}
                        className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-faint ring-1 ring-inset ring-line"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
