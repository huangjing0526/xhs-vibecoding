"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import type { ContentCard, DraftNote, TopicBrief } from "@/lib/xhsWorkflow";

interface TopicWorkspaceProps {
  topics: ContentCard[];
  drafts: DraftNote[];
  generating: boolean;
  rewriting: boolean;
  onDistill: (brief: TopicBrief) => Promise<ContentCard | null>;
  onRewrite: (topic: ContentCard) => Promise<void>;
  onCancel: () => void;
  onOpen: (topic: ContentCard) => void;
}

export default function TopicWorkspace({ topics, drafts, generating, rewriting, onDistill, onRewrite, onCancel, onOpen }: TopicWorkspaceProps) {
  const [theme, setTheme] = useState("");
  const [reference, setReference] = useState("");
  const [editing, setEditing] = useState<ContentCard | null>(null);
  const busy = generating || rewriting;

  async function distill() {
    const topic = await onDistill({ theme, reference });
    if (topic) setEditing(topic);
  }

  return (
    <div className="space-y-4">
      <section className="space-y-5 rounded-3xl border border-line bg-surface p-5 shadow-card md:p-6">
        <div>
          <h2 className="text-lg font-bold text-ink">这次想写什么？</h2>
          <p className="mt-1 text-sm text-muted">提交主题和参考，先提炼思路，再改写成你的内容。</p>
        </div>
        <Field label="主题">
          <Input value={theme} onChange={(event) => setTheme(event.target.value)} disabled={busy} placeholder="例如：用 AI 编程，如何把需求说清楚" />
        </Field>
        <Field label="参考内容" hint="可粘贴文章、笔记或链接；链接请单独一行。">
          <Textarea value={reference} onChange={(event) => setReference(event.target.value)} disabled={busy} rows={6} placeholder="粘贴参考原文、自己的记录，或参考链接" />
        </Field>
        <div className="flex items-center gap-2">
          <Button variant="ai" icon={<Sparkles size={16} />} loading={generating} disabled={busy} onClick={distill}>AI 提炼</Button>
          {generating && <Button variant="ghost" onClick={onCancel}>取消</Button>}
        </div>
      </section>
      {editing && (
        <section className="space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-card md:p-6">
          <div>
            <h2 className="text-lg font-bold text-ink">确认提炼结果</h2>
            <p className="mt-1 text-sm text-muted">可以修改标题、核心观点和提纲，确认后改写成正文。</p>
          </div>
          <Field label="标题建议（每行一个）">
            <Textarea rows={3} disabled={busy} value={editing.titleCandidates.join("\n")} onChange={(event) => setEditing({ ...editing, titleCandidates: event.target.value.split("\n") })} />
          </Field>
          <Field label="核心观点">
            <Textarea rows={3} disabled={busy} value={editing.coreViewpoint} onChange={(event) => setEditing({ ...editing, coreViewpoint: event.target.value })} />
          </Field>
          <Field label="内容提纲（每行一段）">
            <Textarea rows={5} disabled={busy} value={editing.outline.join("\n")} onChange={(event) => setEditing({ ...editing, outline: event.target.value.split("\n") })} />
          </Field>
          <Button variant="ai" loading={rewriting} disabled={busy} onClick={() => onRewrite(editing)}>确认并改写成稿</Button>
        </section>
      )}
      <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        <h2 className="border-b border-line px-5 py-4 font-bold text-ink">选题记录 · {topics.length}</h2>
        {topics.length === 0 ? <p className="p-5 text-sm text-muted">还没有选题，提交上方主题和参考开始提炼。</p> : (
          <ul className="divide-y divide-line">
            {topics.map((topic) => {
              const hasDraft = drafts.some((draft) => draft.topicId === topic.topicId);
              return (
                <li key={topic.topicId} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{topic.titleCandidates[0] || topic.coreViewpoint}</p>
                    <p className="mt-1 text-xs text-muted">{hasDraft ? "已成稿" : "待改写"}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="secondary" disabled={busy} onClick={() => setEditing(topic)}>查看与编辑</Button>
                    <Button variant="ghost" onClick={() => onOpen(topic)}>{hasDraft ? "查看正文" : "打开项目"}</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
