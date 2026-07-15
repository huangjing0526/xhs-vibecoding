"use client";

import { useMemo, useState } from "react";
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
      <div className="rounded-lg border border-[#E5E5EA] bg-white p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#1D1D1F]">改写控制</h3>
            <p className="mt-1 text-sm text-[#6E6E73]">
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
            <button
              type="button"
              onClick={handleRewrite}
              disabled={!input}
              className="rounded-lg bg-[#FF2442] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(255,36,66,0.18)] disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6] disabled:shadow-none"
            >
              改写内容
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-lg border border-[#E5E5EA] bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A1A1A6]">Original</div>
          <h3 className="mt-2 text-xl font-semibold leading-7 text-[#1D1D1F]">{getSourceTitle(selectedTopic, selectedDraft)}</h3>
          <div className="mt-4 whitespace-pre-wrap rounded-lg bg-[#F5F5F7] p-4 text-sm leading-7 text-[#1D1D1F]">
            {getSourceBody(selectedTopic, selectedDraft)}
          </div>
        </section>

        <section className="rounded-lg border border-[#E5E5EA] bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A1A1A6]">Rewrite</div>
              <h3 className="mt-2 text-xl font-semibold text-[#1D1D1F]">改写结果</h3>
            </div>
            <button
              type="button"
              onClick={handleApply}
              disabled={!result}
              className="rounded-lg border border-[#D2D2D7] bg-white px-4 py-2 text-sm font-semibold text-[#1D1D1F] hover:bg-[#F5F5F7] disabled:cursor-not-allowed disabled:text-[#A1A1A6]"
            >
              应用到草稿
            </button>
          </div>

          {result ? (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                {result.titles.map((title, index) => (
                  <button
                    key={title}
                    type="button"
                    className="block w-full rounded-lg border border-[#E5E5EA] bg-[#FBFBFD] px-3 py-2 text-left text-sm font-semibold leading-6 text-[#1D1D1F] hover:border-[#FF2442]"
                  >
                    <span className="mr-2 text-xs font-semibold text-[#FF2442]">0{index + 1}</span>
                    {title}
                  </button>
                ))}
              </div>
              <div className="whitespace-pre-wrap rounded-lg bg-[#F5F5F7] p-4 text-sm leading-7 text-[#1D1D1F]">
                {result.content}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg bg-[#FFF1F3] p-3">
                  <div className="text-xs font-semibold text-[#FF2442]">命中道</div>
                  <p className="mt-2 text-sm leading-6 text-[#1D1D1F]">{result.hitDao}</p>
                </div>
                <div className="rounded-lg border border-[#E5E5EA] p-3">
                  <div className="text-xs font-semibold text-[#6E6E73]">结构建议</div>
                  <ul className="mt-2 space-y-1 text-sm leading-6 text-[#1D1D1F]">
                    {result.structureNotes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="rounded-lg border border-[#F6D8A8] bg-[#FFF8EB] p-3">
                <div className="text-xs font-semibold text-[#B7791F]">风险提示</div>
                <ul className="mt-2 space-y-1 text-sm leading-6 text-[#1D1D1F]">
                  {result.risks.map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-[#D2D2D7] text-sm text-[#6E6E73]">
              {input ? "点击「改写内容」生成第一版结果。" : "先选择选题或草稿。"}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
