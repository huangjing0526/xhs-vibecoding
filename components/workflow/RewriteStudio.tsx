"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import EmptyState from "@/components/ui/EmptyState";
import SegmentedControl from "./SegmentedControl";
import type { BloggerDistillation } from "@/lib/bloggerWorkflow";
import {
  createFallbackRewrite,
  draftToRewriteInput,
  topicToRewriteInput,
  type RewriteIntensity,
  type RewriteResult,
  type RewriteTarget,
} from "@/lib/rewriteWorkflow";
import { DRAFT_STATUS, type ContentCard, type DraftNote } from "@/lib/xhsWorkflow";
import { DEFAULT_TARGET_ID } from "@/lib/targets";

interface RewriteStudioProps {
  selectedTopic: ContentCard | null;
  selectedDraft: DraftNote | null;
  bloggerDistillation: BloggerDistillation | null;
  onApplyToDraft: (draft: DraftNote) => void;
}

function getSourceTitle(topic: ContentCard | null, draft: DraftNote | null): string {
  if (draft?.title) return draft.title;
  if (topic?.titleCandidates[0]) return topic.titleCandidates[0];
  return "尚未选择内容";
}

function getSourceBody(topic: ContentCard | null, draft: DraftNote | null): string {
  if (draft?.content) return draft.content;
  if (topic) {
    return [
      `痛点：${topic.painPoint}`,
      `观点：${topic.coreViewpoint}`,
      `资产：${topic.reusableAsset}`,
      `结构：${topic.outline.join(" / ")}`,
    ].filter(Boolean).join("\n");
  }
  return "先从选题生成中选择一条选题，或生成一篇草稿。";
}

export default function RewriteStudio({
  selectedTopic,
  selectedDraft,
  bloggerDistillation,
  onApplyToDraft,
}: RewriteStudioProps) {
  const [target, setTarget] = useState<RewriteTarget>("full");
  const [intensity, setIntensity] = useState<RewriteIntensity>("medium");
  const [result, setResult] = useState<RewriteResult | null>(null);

  const input = useMemo(() => {
    if (selectedDraft) return draftToRewriteInput(selectedDraft);
    if (selectedTopic) return topicToRewriteInput(selectedTopic);
    return null;
  }, [selectedDraft, selectedTopic]);

  const handleRewrite = () => {
    if (!input) return;
    setResult(createFallbackRewrite(input, bloggerDistillation, target, intensity));
  };

  const handleApply = () => {
    if (!result) return;
    const baseDraft: DraftNote = selectedDraft || {
      noteId: `NOTE-${Date.now().toString(36).toUpperCase()}`,
      topicId: selectedTopic?.topicId || "",
      target: selectedTopic?.targets[0] ?? DEFAULT_TARGET_ID,
      title: "",
      coverText: selectedTopic?.coverText || "",
      content: "",
      imageSuggestions: selectedTopic?.reusableAsset || "",
      tags: [],
      commentPrompt: selectedTopic?.commentPrompt || "",
      status: DRAFT_STATUS.pending,
    };

    onApplyToDraft({
      ...baseDraft,
      title: result.titles[0] || baseDraft.title,
      content: result.content,
      imageSuggestions: baseDraft.imageSuggestions || selectedTopic?.reusableAsset || "",
    });
  };

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-[15px] font-bold text-ink">改写控制</h3>
            <p className="mt-1 text-sm text-muted">
              当前参考：{bloggerDistillation ? "已选择博主道库" : "默认道库"}。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              value={target}
              onChange={setTarget}
              ariaLabel="改写目标"
              compact
              options={[
                { value: "title", label: "标题" },
                { value: "content", label: "正文" },
                { value: "structure", label: "结构" },
                { value: "full", label: "全文" },
              ]}
            />
            <SegmentedControl
              value={intensity}
              onChange={setIntensity}
              ariaLabel="改写强度"
              compact
              options={[
                { value: "light", label: "轻改" },
                { value: "medium", label: "中改" },
                { value: "deep", label: "重构" },
              ]}
            />
            <Button variant="ai" onClick={handleRewrite} disabled={!input} icon={<Sparkles size={15} />}>
              改写内容
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-3xl border border-line bg-surface p-5 shadow-card">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">改写前</div>
          <h3 className="mt-2 text-xl font-bold leading-7 text-ink">{getSourceTitle(selectedTopic, selectedDraft)}</h3>
          <div className="mt-4 whitespace-pre-wrap rounded-2xl bg-soft p-4 text-sm leading-7 text-ink">
            {getSourceBody(selectedTopic, selectedDraft)}
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-surface p-5 shadow-card">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">改写后</div>
              <h3 className="mt-2 text-xl font-bold text-ink">改写结果</h3>
            </div>
            <Button variant="secondary" onClick={handleApply} disabled={!result}>
              应用到草稿
            </Button>
          </div>

          {result ? (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                {result.titles.map((title, index) => (
                  <button
                    key={title}
                    type="button"
                    className="block w-full rounded-2xl border border-line bg-soft px-3.5 py-2.5 text-left text-sm font-semibold leading-6 text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    <span className="mr-2 font-rounded text-xs font-bold text-brand-500">0{index + 1}</span>
                    {title}
                  </button>
                ))}
              </div>
              <div className="whitespace-pre-wrap rounded-2xl bg-soft p-4 text-sm leading-7 text-ink">
                {result.content}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-brand-50 p-4">
                  <div className="text-xs font-bold text-brand-600">命中道</div>
                  <p className="mt-2 text-sm leading-6 text-ink">{result.hitDao}</p>
                </div>
                <div className="rounded-2xl border border-line p-4">
                  <div className="text-xs font-bold text-muted">结构建议</div>
                  <ul className="mt-2 space-y-1 text-sm leading-6 text-ink">
                    {result.structureNotes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <Callout tone="warn">
                <div className="font-bold">风险提示</div>
                <ul className="mt-1.5 space-y-1 font-medium">
                  {result.risks.map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </Callout>
            </div>
          ) : (
            <div className="mt-4 min-h-[420px]">
              <EmptyState
                icon={<Sparkles size={22} />}
                title={input ? "还没有改写结果" : "先选择选题或草稿"}
                description={input ? "点右上「改写内容」，按当前道库生成第一版。" : undefined}
              />
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
