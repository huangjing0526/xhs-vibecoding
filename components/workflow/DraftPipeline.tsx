import { useEffect, useState } from "react";
import type { ContentCard, DraftNote } from "@/lib/xhsWorkflow";

interface DraftPipelineProps {
  topics: ContentCard[];
  drafts: DraftNote[];
  selectedTopic: ContentCard | null;
  selectedDraft: DraftNote | null;
  isGenerating: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  onGenerateDraft: () => void;
  onSelectTopic: (topic: ContentCard) => void;
  onSelectDraft: (draft: DraftNote) => void;
  onSaveDraft: (draft: DraftNote) => void;
  onPublishDraft: (draft: DraftNote) => void;
  onOpenCover: () => void;
}

function getTitle(draft: DraftNote): string {
  return draft.title || draft.noteId || "未命名草稿";
}

function clip(text: string, maxLength = 120): string {
  if (!text) return "未填写";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export default function DraftPipeline({
  topics,
  drafts,
  selectedTopic,
  selectedDraft,
  isGenerating,
  isSaving,
  isPublishing,
  onGenerateDraft,
  onSelectTopic,
  onSelectDraft,
  onSaveDraft,
  onPublishDraft,
  onOpenCover,
}: DraftPipelineProps) {
  const writableTopics = topics.filter((topic) => topic.status === "待写");
  const [draftForm, setDraftForm] = useState<DraftNote | null>(selectedDraft);

  useEffect(() => {
    setDraftForm(selectedDraft);
  }, [selectedDraft]);

  const updateDraftField = (field: keyof DraftNote, value: string) => {
    setDraftForm((current) => {
      if (!current) return current;
      if (field === "tags") {
        return {
          ...current,
          tags: value.split(/\s+/).map((item) => item.trim()).filter(Boolean),
        };
      }
      return { ...current, [field]: value };
    });
  };

  return (
    <section className="grid gap-3 xl:grid-cols-[0.85fr_1.65fr]">
      <div className="border border-stone-300 bg-white">
        <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2">
          <div className="text-xs font-black uppercase tracking-wider text-stone-500">写作队列</div>
          <button
            type="button"
            onClick={onGenerateDraft}
            disabled={isGenerating || (!selectedTopic && writableTopics.length === 0)}
            className="px-3 py-1 text-xs font-black text-stone-700 hover:text-rose-600 disabled:cursor-not-allowed disabled:text-stone-300"
          >
            {isGenerating ? "写作中" : "+ 生成草稿"}
          </button>
        </div>

        <div className="max-h-[calc(100vh-260px)] overflow-auto">
          {(writableTopics.length > 0 ? writableTopics : topics).slice(0, 12).map((topic) => {
            const isSelected = selectedTopic?.topicId === topic.topicId;
            return (
              <button
                key={`${topic.recordId || topic.topicId}-queue`}
                type="button"
                onClick={() => onSelectTopic(topic)}
                className={`block w-full border-b border-stone-100 p-3 text-left last:border-b-0 ${
                  isSelected ? "bg-stone-950 text-white" : "hover:bg-stone-50"
                }`}
              >
                <div className={`text-xs font-bold ${isSelected ? "text-stone-400" : "text-stone-400"}`}>{topic.topicId}</div>
                <div className="mt-1.5 text-sm font-black leading-5">{topic.titleCandidates[0] || topic.coreViewpoint}</div>
                <div className={`mt-1.5 text-xs leading-5 ${isSelected ? "text-stone-300" : "text-stone-500"}`}>
                  {clip(topic.coreViewpoint, 86)}
                </div>
              </button>
            );
          })}
          {topics.length === 0 && (
            <div className="p-8 text-center text-sm text-stone-500">暂无待写选题</div>
          )}
        </div>
      </div>

      <div className="border border-stone-300 bg-white">
        <div className="grid gap-0 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="max-h-[calc(100vh-260px)] overflow-auto border-b border-stone-200 xl:border-b-0 xl:border-r">
            <div className="border-b border-stone-200 bg-stone-50 px-3 py-2 text-xs font-black uppercase tracking-wider text-stone-500">
              草稿库 <span className="tabular-nums text-stone-950">{drafts.length}</span>
            </div>
            {drafts.map((draft) => {
              const isSelected = selectedDraft?.noteId === draft.noteId;
              const isPublished = draft.status === "已发布";
              return (
                <button
                  key={`${draft.recordId || draft.noteId}-${draft.title}`}
                  type="button"
                  onClick={() => onSelectDraft(draft)}
                  className={`block w-full border-b border-stone-100 p-3 text-left last:border-b-0 ${
                    isSelected ? "bg-stone-100" : "hover:bg-stone-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-stone-400">{draft.noteId}</span>
                    <span className={`px-1.5 py-0.5 text-xs font-semibold ${isPublished ? "bg-teal-100 text-teal-700" : "bg-stone-100 text-stone-600"}`}>
                      {draft.status || "待发布"}
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm font-black text-stone-950">{getTitle(draft)}</div>
                  <div className="mt-1 text-xs leading-5 text-stone-500">{clip(draft.content, 72)}</div>
                </button>
              );
            })}
            {drafts.length === 0 && (
              <div className="p-8 text-center text-sm text-stone-500">草稿库暂无记录</div>
            )}
          </div>

          <article className="min-h-[420px] p-4">
            {draftForm ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">{draftForm.topicId}</span>
                    <span className={`px-2 py-0.5 text-xs font-semibold ${draftForm.status === "已发布" ? "bg-teal-100 text-teal-700" : "bg-stone-100 text-stone-600"}`}>
                      {draftForm.status || "待发布"}
                    </span>
                    <span className="text-xs font-semibold text-stone-500 tabular-nums">
                      {draftForm.content.length}/200
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onSaveDraft(draftForm)}
                      disabled={isSaving}
                      className="border border-stone-950 bg-white px-3 py-1.5 text-xs font-black text-stone-950 transition-colors hover:bg-stone-950 hover:text-white disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400"
                    >
                      {isSaving ? "保存中" : "保存"}
                    </button>
                    <button
                      type="button"
                      onClick={onOpenCover}
                      className="border border-stone-300 bg-white px-3 py-1.5 text-xs font-black text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950"
                    >
                      图片
                    </button>
                    <button
                      type="button"
                      onClick={() => onPublishDraft(draftForm)}
                      disabled={isPublishing || draftForm.status === "已发布"}
                      className="border border-rose-600 bg-rose-600 px-3 py-1.5 text-xs font-black text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
                    >
                      {isPublishing ? "发布中" : draftForm.status === "已发布" ? "已发布" : "标记发布"}
                    </button>
                  </div>
                </div>

                <label className="mt-4 block">
                  <span className="text-xs font-black text-stone-500">标题</span>
                  <input
                    value={draftForm.title}
                    onChange={(event) => updateDraftField("title", event.target.value)}
                    className="mt-1.5 w-full border border-stone-300 bg-white px-3 py-2 text-base font-black text-stone-950 outline-none focus:border-stone-950"
                  />
                </label>

                <label className="mt-3 block">
                  <span className="text-xs font-black text-stone-500">正文</span>
                  <textarea
                    value={draftForm.content}
                    onChange={(event) => updateDraftField("content", event.target.value)}
                    rows={8}
                    className="mt-1.5 w-full resize-y border border-stone-300 bg-white px-3 py-2 text-sm leading-6 text-stone-800 outline-none focus:border-stone-950"
                  />
                </label>

                <label className="mt-3 block">
                  <span className="text-xs font-black text-stone-500">评论引导</span>
                  <input
                    value={draftForm.commentPrompt}
                    onChange={(event) => updateDraftField("commentPrompt", event.target.value)}
                    className="mt-1.5 w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-stone-950"
                  />
                </label>

                <label className="mt-3 block">
                  <span className="text-xs font-black text-stone-500">话题标签</span>
                  <input
                    value={draftForm.tags.join(" ")}
                    onChange={(event) => updateDraftField("tags", event.target.value)}
                    className="mt-1.5 w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-stone-950"
                  />
                </label>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {draftForm.tags.map((tag) => (
                    <span key={tag} className="bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center text-sm text-stone-500">
                选择一篇草稿查看正文
              </div>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}
