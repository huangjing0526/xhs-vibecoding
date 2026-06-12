"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import CoverEditor from "@/components/CoverEditor";
import { DEFAULT_COVER_CONFIG, generateCoverDataUrl, type CoverConfig } from "@/lib/cover";
import {
  contentCardToCoverInput,
  createCoverTemplateOptions,
  draftToCoverInput,
  getCoverSourceKey,
  type CoverInput,
  type CoverPlan,
} from "@/lib/coverWorkflow";
import {
  CONTENT_IMAGE_TEMPLATES,
  contentCardToImageSourceInput,
  downloadImageAsset,
  draftToImageSourceInput,
  getContentImageTemplate,
  renderContentImageDataUrl,
  type ContentImagePlan,
  type ContentImageTemplateType,
  type ImageWorkflowSourceInput,
} from "@/lib/imageWorkflow";
import { hasGeneratedCover, type ContentCard, type DraftNote } from "@/lib/xhsWorkflow";

type ImageMode = "cover" | "content";

interface CoverStudioProps {
  topics: ContentCard[];
  drafts: DraftNote[];
  selectedTopic: ContentCard | null;
  selectedDraft: DraftNote | null;
  coverConfig: CoverConfig;
  coverPlan: CoverPlan | null;
  imageMode: ImageMode;
  contentImageTemplate: ContentImageTemplateType;
  contentImagePlan: ContentImagePlan | null;
  contentImageDataUrl: string;
  isGenerating: boolean;
  isGeneratingContentImage: boolean;
  onGenerateCover: () => void;
  onGenerateContentImage: () => void;
  onSelectTopic: (topic: ContentCard) => void;
  onSelectDraft: (draft: DraftNote) => void;
  onConfigChange: (config: CoverConfig) => void;
  onCoverGenerated: (dataUrl: string) => void;
  onImageModeChange: (mode: ImageMode) => void;
  onContentTemplateChange: (templateType: ContentImageTemplateType) => void;
  onContentImageGenerated: (dataUrl: string) => void;
}

type CoverVersionSource =
  | { sourceType: "draft"; source: DraftNote }
  | { sourceType: "topic"; source: ContentCard };

type CoverVersion = CoverVersionSource & {
  id: string;
  config: CoverConfig;
  title: string;
  status: string;
  style: string;
  hasStoredConfig: boolean;
};

function getSourceTitle(topic: ContentCard | null, draft: DraftNote | null): string {
  if (draft?.title) return draft.title;
  if (topic?.titleCandidates[0]) return topic.titleCandidates[0];
  return "先选择选题或草稿";
}

function getSourceInput(topic: ContentCard | null, draft: DraftNote | null): CoverInput | null {
  if (draft) return draftToCoverInput(draft);
  if (topic) return contentCardToCoverInput(topic);
  return null;
}

function getImageSourceInput(topic: ContentCard | null, draft: DraftNote | null): ImageWorkflowSourceInput | null {
  if (draft) return draftToImageSourceInput(draft);
  if (topic) return contentCardToImageSourceInput(topic);
  return null;
}

function clip(text?: string, maxLength = 74): string {
  if (!text) return "未填写";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getVersionId(sourceType: CoverVersion["sourceType"], source: ContentCard | DraftNote): string {
  if (sourceType === "draft") {
    const draft = source as DraftNote;
    return `draft-${draft.noteId || draft.recordId}`;
  }
  const topic = source as ContentCard;
  return `topic-${topic.topicId || topic.recordId}`;
}

function getFallbackCoverConfig(input: CoverInput): CoverConfig {
  const [template] = createCoverTemplateOptions(input);
  return {
    ...DEFAULT_COVER_CONFIG,
    ...(template?.config || {}),
    sourceKey: getCoverSourceKey(input),
  };
}

function isTitlePosition(value: unknown): value is CoverConfig["titlePosition"] {
  return value === "center" || value === "left" || value === "bottom";
}

function parseStoredCoverConfig(json: string | undefined, fallback: CoverConfig): CoverConfig | null {
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    const config = parsed as Partial<CoverConfig>;

    return {
      ...fallback,
      ...config,
      title: typeof config.title === "string" && config.title.trim() ? config.title : fallback.title,
      subtitle: typeof config.subtitle === "string" ? config.subtitle : fallback.subtitle,
      backgroundColor: typeof config.backgroundColor === "string" ? config.backgroundColor : fallback.backgroundColor,
      overlayColor: typeof config.overlayColor === "string" ? config.overlayColor : fallback.overlayColor,
      overlayOpacity: typeof config.overlayOpacity === "number" ? config.overlayOpacity : fallback.overlayOpacity,
      overlayBlur: typeof config.overlayBlur === "number" ? config.overlayBlur : fallback.overlayBlur,
      titleSize: typeof config.titleSize === "number" ? config.titleSize : fallback.titleSize,
      titleColor: typeof config.titleColor === "string" ? config.titleColor : fallback.titleColor,
      titlePosition: isTitlePosition(config.titlePosition) ? config.titlePosition : fallback.titlePosition,
      fontFamily: typeof config.fontFamily === "string" ? config.fontFamily : fallback.fontFamily,
    };
  } catch (error) {
    console.warn("[CoverStudio] 封面配置解析失败", {
      action: "cover.parseStoredConfig",
      error,
    });
    return null;
  }
}

function createConfigFromCoverMetadata(
  item: ContentCard | DraftNote,
  input: CoverInput
): { config: CoverConfig; hasStoredConfig: boolean } {
  const fallback = getFallbackCoverConfig(input);
  const storedConfig = parseStoredCoverConfig(item.coverConfigJson, fallback);
  const config = storedConfig || fallback;

  return {
    hasStoredConfig: Boolean(storedConfig),
    config: {
      ...config,
      sourceKey: getCoverSourceKey(input),
      title: item.coverTitle || config.title,
      subtitle: item.coverSubtitle || config.subtitle,
      backgroundColor: item.coverPrimaryColor || config.backgroundColor,
    },
  };
}

function createDraftCoverVersion(draft: DraftNote): CoverVersion | null {
  if (!hasGeneratedCover(draft)) return null;
  const input = draftToCoverInput(draft);
  const { config, hasStoredConfig } = createConfigFromCoverMetadata(draft, input);

  return {
    id: getVersionId("draft", draft),
    sourceType: "draft",
    source: draft,
    config,
    title: draft.coverTitle || draft.title || draft.noteId,
    status: draft.coverStatus || "已生成",
    style: draft.coverStyle || config.templateId || "自定义",
    hasStoredConfig,
  };
}

function createTopicCoverVersion(topic: ContentCard): CoverVersion | null {
  if (!hasGeneratedCover(topic)) return null;
  const input = contentCardToCoverInput(topic);
  const { config, hasStoredConfig } = createConfigFromCoverMetadata(topic, input);

  return {
    id: getVersionId("topic", topic),
    sourceType: "topic",
    source: topic,
    config,
    title: topic.coverTitle || topic.titleCandidates[0] || topic.topicId,
    status: topic.coverStatus || "已生成",
    style: topic.coverStyle || config.templateId || "自定义",
    hasStoredConfig,
  };
}

function CoverVersionThumbnail({ config }: { config: CoverConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    let isCancelled = false;
    setPreviewUrl("");

    async function renderPreview() {
      if (!canvasRef.current) return;

      try {
        const dataUrl = await generateCoverDataUrl(canvasRef.current, config);
        if (!isCancelled) setPreviewUrl(dataUrl);
      } catch (error) {
        console.warn("[CoverStudio] 封面缩略图生成失败", {
          action: "cover.renderVersionThumb",
          error,
        });
      }
    }

    renderPreview();
    return () => {
      isCancelled = true;
    };
  }, [config]);

  return (
    <div className="relative aspect-[3/4] overflow-hidden border border-stone-300 bg-stone-100">
      {previewUrl ? (
        <Image src={previewUrl} alt="封面缩略图" fill sizes="128px" className="object-cover" unoptimized />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-stone-400">
          生成中
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

function ContentImagePreview({
  plan,
  onGenerated,
}: {
  plan: ContentImagePlan | null;
  onGenerated: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    let isCancelled = false;
    setPreviewUrl("");
    onGenerated("");

    async function renderPreview() {
      if (!canvasRef.current || !plan) return;

      try {
        const dataUrl = await renderContentImageDataUrl(canvasRef.current, plan);
        if (!isCancelled) {
          setPreviewUrl(dataUrl);
          onGenerated(dataUrl);
        }
      } catch (error) {
        console.warn("[CoverStudio] 内容配图渲染失败", {
          action: "image.renderContentPreview",
          error,
        });
      }
    }

    renderPreview();
    return () => {
      isCancelled = true;
    };
  }, [onGenerated, plan]);

  return (
    <div className="border border-stone-300 bg-stone-50 p-4">
      <div className="mx-auto max-w-[420px]">
        <div className="relative aspect-[3/4] overflow-hidden border border-stone-950 bg-white shadow-[10px_10px_0_#1c1917]">
          {previewUrl ? (
            <Image src={previewUrl} alt="内容配图预览" fill sizes="420px" className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-stone-500">
              {plan ? "渲染中" : "等待生成"}
            </div>
          )}
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

export default function CoverStudio({
  topics,
  drafts,
  selectedTopic,
  selectedDraft,
  coverConfig,
  coverPlan,
  imageMode,
  contentImageTemplate,
  contentImagePlan,
  contentImageDataUrl,
  isGenerating,
  isGeneratingContentImage,
  onGenerateCover,
  onGenerateContentImage,
  onSelectTopic,
  onSelectDraft,
  onConfigChange,
  onCoverGenerated,
  onImageModeChange,
  onContentTemplateChange,
  onContentImageGenerated,
}: CoverStudioProps) {
  const sourceInput = useMemo(
    () => getSourceInput(selectedTopic, selectedDraft),
    [selectedDraft, selectedTopic]
  );
  const imageSourceInput = useMemo(
    () => getImageSourceInput(selectedTopic, selectedDraft),
    [selectedDraft, selectedTopic]
  );
  const templates = useMemo(
    () => (sourceInput ? createCoverTemplateOptions(sourceInput) : []),
    [sourceInput]
  );
  const sourceKey = sourceInput ? getCoverSourceKey(sourceInput) : "";
  const hasSource = Boolean(sourceInput);
  const sourceTitle = getSourceTitle(selectedTopic, selectedDraft);
  const assetLabel = imageMode === "content" ? "图片依据" : selectedDraft ? "草稿内容" : "可收藏资产";
  const assetText = imageMode === "content"
    ? imageSourceInput?.content || imageSourceInput?.coreViewpoint || imageSourceInput?.reusableAsset
    : selectedDraft
      ? selectedDraft.content
      : sourceInput?.reusableAsset || selectedTopic?.reusableAsset;
  const coverVersions = useMemo(() => {
    return [
      ...drafts.map(createDraftCoverVersion).filter((item): item is CoverVersion => Boolean(item)),
      ...topics.map(createTopicCoverVersion).filter((item): item is CoverVersion => Boolean(item)),
    ];
  }, [drafts, topics]);
  const selectedVersionId = selectedDraft
    ? getVersionId("draft", selectedDraft)
    : selectedTopic
      ? getVersionId("topic", selectedTopic)
      : "";
  const activeCoverVersion = useMemo(
    () => coverVersions.find((version) => version.id === selectedVersionId) || null,
    [coverVersions, selectedVersionId]
  );
  const visibleCoverPlan =
    coverPlan && (coverPlan.title === coverConfig.title || coverPlan.subtitle === coverConfig.subtitle)
      ? coverPlan
      : null;
  const activeContentTemplate = CONTENT_IMAGE_TEMPLATES.find((template) => template.id === contentImageTemplate) || CONTENT_IMAGE_TEMPLATES[0];

  const handleSelectVersion = useCallback((version: CoverVersion) => {
    if (version.sourceType === "draft") {
      onSelectDraft(version.source);
    } else {
      onSelectTopic(version.source);
    }
    onCoverGenerated("");
    onConfigChange(version.config);
  }, [onConfigChange, onCoverGenerated, onSelectDraft, onSelectTopic]);

  useEffect(() => {
    if (!sourceInput || templates.length === 0) return;
    if (coverConfig.sourceKey === sourceKey) return;
    onConfigChange(activeCoverVersion?.config || templates[0].config);
  }, [activeCoverVersion, coverConfig.sourceKey, onConfigChange, sourceInput, sourceKey, templates]);

  const handleDownloadContentImage = useCallback(() => {
    if (!contentImageDataUrl) return;
    downloadImageAsset(contentImageDataUrl, `xhs-content-image-${Date.now()}.png`);
  }, [contentImageDataUrl]);

  return (
    <section className="border border-stone-300 bg-white">
      <div className="grid border-b border-stone-200 lg:grid-cols-[1fr_auto]">
        <div className="px-4 py-3">
          <h2 className="font-black text-stone-950">图片生成工作台</h2>
          <p className="mt-1 text-xs text-stone-500">
            {imageMode === "cover" ? "封面图" : activeContentTemplate.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 px-4 py-3 lg:border-l lg:border-t-0">
          <div className="grid grid-cols-2 border border-stone-300">
            {([
              { id: "cover", label: "封面图" },
              { id: "content", label: "内容配图" },
            ] as const).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onImageModeChange(mode.id)}
                className={`px-3 py-2 text-sm font-black transition-colors ${
                  imageMode === mode.id
                    ? "bg-stone-950 text-white"
                    : "bg-white text-stone-700 hover:bg-stone-100"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={imageMode === "cover" ? onGenerateCover : onGenerateContentImage}
            disabled={(imageMode === "cover" ? isGenerating : isGeneratingContentImage) || !hasSource}
            className="border border-teal-700 bg-teal-700 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-stone-950 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
          >
            {imageMode === "cover"
              ? isGenerating ? "生成中" : "生成封面方案"
              : isGeneratingContentImage ? "生成中" : "生成内容图"}
          </button>
        </div>
      </div>

      <div className="grid border-b border-stone-200 bg-[#f8f6f1] lg:grid-cols-[1.2fr_0.9fr_0.9fr]">
        <div className="border-b border-stone-200 p-4 lg:border-b-0 lg:border-r">
          <div className="text-xs font-bold text-stone-400">当前内容</div>
          <div className="mt-2 text-base font-black leading-6 text-stone-950">{sourceTitle}</div>
        </div>
        <div className="border-b border-stone-200 p-4 lg:border-b-0 lg:border-r">
          <div className="text-xs font-bold text-rose-600">痛点</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-stone-700">
            {clip(sourceInput?.painPoint || imageSourceInput?.painPoint || selectedTopic?.painPoint)}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-bold text-teal-700">{assetLabel}</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-stone-700">
            {clip(assetText)}
          </div>
        </div>
      </div>

      {imageMode === "cover" ? (
        <>
          {coverVersions.length > 0 && (
            <div className="border-b border-stone-200 bg-white">
              <div className="grid gap-3 border-b border-stone-200 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div>
                  <h3 className="font-black text-stone-950">封面版本</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    已保存 {coverVersions.length} 张
                  </p>
                </div>
                <div className="text-xs font-bold text-stone-500">
                  当前：{selectedVersionId ? activeCoverVersion?.status || "本地模板" : "未选择"}
                </div>
              </div>
              <div className="flex gap-3 overflow-x-auto p-4">
                {coverVersions.map((version) => {
                  const isActive = selectedVersionId === version.id;
                  return (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => handleSelectVersion(version)}
                      className={`w-28 flex-none border p-2 text-left transition-colors sm:w-32 ${
                        isActive
                          ? "border-stone-950 bg-stone-950 text-white"
                          : "border-stone-200 bg-[#f8f6f1] text-stone-950 hover:border-stone-600"
                      }`}
                    >
                      <CoverVersionThumbnail config={version.config} />
                      <div className={`mt-2 text-[11px] font-black ${isActive ? "text-stone-300" : "text-stone-400"}`}>
                        {version.sourceType === "draft" ? "草稿封面" : "选题封面"}
                      </div>
                      <div className="mt-1 line-clamp-2 min-h-9 whitespace-pre-wrap text-xs font-black leading-[18px]">
                        {version.title}
                      </div>
                      <div className={`mt-2 flex items-center justify-between gap-2 text-[11px] font-bold ${
                        isActive ? "text-stone-300" : "text-stone-500"
                      }`}>
                        <span>{version.style}</span>
                        {!version.hasStoredConfig && <span>模板</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {visibleCoverPlan && (
            <div className="grid border-b border-stone-200 bg-white md:grid-cols-[0.7fr_1fr_1.4fr]">
              <div className="border-b border-stone-200 p-4 md:border-b-0 md:border-r">
                <div className="text-xs font-bold text-stone-400">AI 方案</div>
                <div className="mt-2 font-black text-stone-950">{visibleCoverPlan.style}</div>
              </div>
              <div className="border-b border-stone-200 p-4 md:border-b-0 md:border-r">
                <div className="text-xs font-bold text-stone-400">建议大字</div>
                <div className="mt-2 whitespace-pre-wrap font-black leading-6 text-stone-950">{visibleCoverPlan.title}</div>
              </div>
              <div className="p-4">
                <div className="text-xs font-bold text-stone-400">理由</div>
                <div className="mt-2 text-sm leading-6 text-stone-700">{visibleCoverPlan.reason}</div>
              </div>
            </div>
          )}

          <div className="p-4">
            <CoverEditor
              config={coverConfig}
              templates={templates}
              onConfigChange={onConfigChange}
              suggestedTitle={sourceTitle}
              onCoverGenerated={onCoverGenerated}
            />
          </div>
        </>
      ) : (
        <div className="grid gap-4 p-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <div className="border border-stone-300 bg-white">
              <div className="border-b border-stone-200 px-4 py-3">
                <h3 className="font-black text-stone-950">内容图类型</h3>
                <p className="mt-1 text-xs text-stone-500">{activeContentTemplate.description}</p>
              </div>
              <div className="grid gap-2 p-3 sm:grid-cols-2">
                {CONTENT_IMAGE_TEMPLATES.map((template) => {
                  const isActive = contentImageTemplate === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => onContentTemplateChange(template.id)}
                      className={`border p-3 text-left transition-colors ${
                        isActive
                          ? "border-stone-950 bg-stone-950 text-white"
                          : "border-stone-200 bg-white text-stone-950 hover:border-stone-500"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-black">{template.name}</span>
                        <span
                          className="h-5 w-5 border"
                          style={{
                            backgroundColor: template.defaultPalette.background,
                            borderColor: template.defaultPalette.primary,
                          }}
                        />
                      </div>
                      <div className={`mt-2 text-xs ${isActive ? "text-stone-300" : "text-stone-500"}`}>
                        {template.previewTone}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {contentImagePlan && (
              <div className="border border-stone-300 bg-white">
                <div className="grid border-b border-stone-200 md:grid-cols-[0.8fr_1.2fr]">
                  <div className="border-b border-stone-200 p-4 md:border-b-0 md:border-r">
                    <div className="text-xs font-bold text-stone-400">图片方案</div>
                    <div className="mt-2 font-black text-stone-950">{contentImagePlan.title}</div>
                    <div className="mt-1 text-xs font-bold text-teal-700">{getContentImageTemplate(contentImagePlan.templateType).name}</div>
                  </div>
                  <div className="p-4">
                    <div className="text-xs font-bold text-stone-400">摘要</div>
                    <div className="mt-2 text-sm font-semibold leading-6 text-stone-700">{contentImagePlan.summary}</div>
                  </div>
                </div>
                <div className="grid gap-2 p-3 sm:grid-cols-2">
                  {contentImagePlan.blocks.slice(0, 6).map((block) => (
                    <div key={block.id} className="border border-stone-200 bg-stone-50 p-3">
                      <div className="text-xs font-bold text-stone-400">{block.meta || block.lane || block.id}</div>
                      <div className="mt-1 text-sm font-black text-stone-950">{block.title}</div>
                      <div className="mt-1 text-xs leading-5 text-stone-600">{block.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <ContentImagePreview plan={contentImagePlan} onGenerated={onContentImageGenerated} />
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="border border-stone-200 bg-white px-3 py-2">
                <div className="text-xs font-bold text-stone-400">当前类型</div>
                <div className="mt-1 text-sm font-black text-stone-950">{activeContentTemplate.name}</div>
              </div>
              <button
                type="button"
                onClick={handleDownloadContentImage}
                disabled={!contentImageDataUrl}
                className="border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-stone-950 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
              >
                下载
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
