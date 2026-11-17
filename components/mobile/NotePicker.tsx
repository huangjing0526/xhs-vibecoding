"use client";

import { useState } from "react";
import { Check, FileText, X } from "lucide-react";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { getNoteStatus, noteTitle, type NoteStatus } from "@/components/workflow/NoteList";
import { rememberTopic } from "@/lib/mobile/selection";
import type { ContentCard, DraftNote } from "@/lib/xhsWorkflow";

const STATUS_TONE: Record<NoteStatus, BadgeTone> = {
  待写: "neutral",
  待发: "warn",
  已发: "ok",
};

interface NotePickerProps {
  topics: ContentCard[];
  drafts: DraftNote[];
  value: ContentCard | null;
  onChange: (topic: ContentCard) => void;
}

/**
 * 「当前处理哪篇笔记」的选择器：一条状态栏 + 弹出的底部列表。
 *
 * 桌面端靠常驻的左侧笔记列表解决这件事，手机放不下，只能收成一次性的选择动作。
 */
export default function NotePicker({ topics, drafts, value, onChange }: NotePickerProps) {
  const [open, setOpen] = useState(false);

  const pick = (topic: ContentCard) => {
    rememberTopic(topic.topicId);
    onChange(topic);
    setOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-card">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
          <FileText size={17} strokeWidth={1.9} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold leading-tight text-ink">
            {value ? noteTitle(value) : "还没选笔记"}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-faint">
            {value ? value.painPoint || value.coreViewpoint || "点右侧可换一篇" : "从已有笔记里选一篇"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={topics.length === 0}
          className="shrink-0 rounded-xl bg-soft px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:bg-sunken disabled:text-faint"
        >
          {value ? "更换" : "选择"}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/40" onClick={() => setOpen(false)}>
          <div
            className="mx-auto max-h-[72vh] w-full max-w-[520px] overflow-hidden rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-[15px] font-bold text-ink">选一篇笔记</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-xl text-faint hover:bg-soft hover:text-ink"
              >
                <X size={17} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-1">
              {topics.map((topic) => {
                const status = getNoteStatus(topic, drafts);
                const active = topic.topicId === value?.topicId;
                return (
                  <button
                    key={topic.topicId}
                    type="button"
                    onClick={() => pick(topic)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-soft"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold leading-tight text-ink">{noteTitle(topic)}</p>
                      <p className="mt-0.5 truncate text-[11px] font-medium text-faint">
                        {topic.painPoint || topic.coreViewpoint || "暂无描述"}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                    {active && <Check size={16} className="shrink-0 text-brand-500" strokeWidth={2.6} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
