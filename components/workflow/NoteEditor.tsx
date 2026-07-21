"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";
import { Field, Input, Textarea } from "@/components/ui/Field";
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
 * 没草稿 → 一颗「生成草稿」；有草稿 → 标题/封面文案/正文可改，主按钮「保存」，旁挂「爆款优化」。
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
      <div className="flex h-full items-center justify-center bg-soft p-8">
        <EmptyState
          bare
          icon={<Sparkles size={22} />}
          title="从左侧选一篇笔记开始"
          description="也可以点左上「新建」，或去素材库把攒下的素材提炼成选题。"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-soft">
      {/* 标题已经在工作台页头显示，这里只在绑了道库时提示「按谁的结构在写」 */}
      {boundDaokuName && (
        <div className="flex shrink-0 items-center border-b border-line bg-surface px-5 py-2">
          <Badge tone="ok">道库 · {boundDaokuName}</Badge>
        </div>
      )}

      {!form ? (
        <div className="flex flex-1 items-center justify-center p-8">
          {isGenerating ? (
            <div className="w-full max-w-2xl rounded-3xl border border-line bg-surface p-8 shadow-card">
              <Skeleton className="h-7 w-3/5 rounded-xl" />
              <div className="mt-6">
                <SkeletonText lines={6} />
              </div>
              <p className="mt-6 text-xs font-semibold text-brand-500">正在写这一篇…</p>
            </div>
          ) : (
            <EmptyState
              bare
              icon={<Sparkles size={22} />}
              title="这篇还没有草稿"
              description="一键生成后可直接改，也能用「爆款优化」按对标博主的结构打磨。"
              action={
                <Button variant="ai" size="lg" onClick={onGenerateDraft} icon={<Sparkles size={16} />}>
                  生成草稿
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-6">
            <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-surface p-7 shadow-card">
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="标题"
                className="w-full bg-transparent text-2xl font-bold leading-snug text-ink outline-none placeholder:text-faint"
              />
              <div className="my-5 h-px bg-line" />
              <Field label="封面文案">
                <Input
                  value={form.coverText}
                  onChange={(event) => updateField("coverText", event.target.value)}
                  placeholder="一句话，写在封面上"
                />
              </Field>
              <div className="mt-4">
                <Field label="正文">
                  <Textarea
                    value={form.content}
                    onChange={(event) => updateField("content", event.target.value)}
                    rows={18}
                    placeholder="正文…"
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-5 py-3">
            <span className="font-rounded text-xs tabular-nums text-faint">{form.content.length} 字</span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={onGenerateDraft}
                loading={isGenerating}
                icon={<RefreshCw size={13} strokeWidth={2.4} />}
              >
                {isGenerating ? "生成中" : "重新生成"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={onOpenRewrite}
                icon={<Sparkles size={13} className="text-brand-500" />}
              >
                爆款优化
              </Button>
              <Button size="sm" variant="primary" onClick={() => form && onSaveDraft(form)} loading={isSaving}>
                {isSaving ? "保存中" : "保存"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
