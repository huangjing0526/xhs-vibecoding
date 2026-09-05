"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import CoverEditor from "@/components/CoverEditor";
import { DEFAULT_TARGET_ID, assetPx, assetRatioCss } from "@/lib/targets";
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

/** 封面 / 内容配图两种产出，页面级的切换也复用这个类型。 */
export type ImageMode = "cover" | "content";

interface CoverStudioProps {
  topics: ContentCard[];
  drafts: DraftNote[];
  selectedTopic: ContentCard | null;
  selectedDraft: DraftNote | null;
  coverConfig: CoverConfig;
  coverPlan: CoverPlan | null;
  /** 由页面级的三段切换决定，工作台内部不再自己切。 */
  imageMode: ImageMode;
  contentImageTemplate: ContentImageTemplateType;
  contentImagePlan: ContentImagePlan | null;
  contentImageDataUrl: string;
  isGenerating: boolean;
  isGeneratingContentImage: boolean;
  onGenerateCover: () => void;
  onGenerateContentImage: () => void;
  onCancelGenerate: () => void;
  onSelectTopic: (topic: ContentCard) => void;
  onSelectDraft: (draft: DraftNote) => void;
  onConfigChange: (config: CoverConfig) => void;
  onCoverGenerated: (dataUrl: string) => void;
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
        const dataUrl = await generateCoverDataUrl(
          canvasRef.current,
          config,
          assetPx(DEFAULT_TARGET_ID, "cover")
        );
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
    <div
      className="relative overflow-hidden rounded-xl border border-line bg-soft"
      style={{ aspectRatio: assetRatioCss(DEFAULT_TARGET_ID, "cover") }}
    >
      {previewUrl ? (
        <Image src={previewUrl} alt="封面缩略图" fill sizes="128px" className="object-cover" unoptimized />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-faint">
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
        const dataUrl = await renderContentImageDataUrl(
          canvasRef.current,
          plan,
          assetPx(DEFAULT_TARGET_ID, "content")
        );
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
    <div className="rounded-2xl border border-line bg-soft p-4">
      <div className="mx-auto max-w-[420px]">
        <div
          className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-raised"
          style={{ aspectRatio: assetRatioCss(DEFAULT_TARGET_ID, "content") }}
        >
          {previewUrl ? (
            <Image src={previewUrl} alt="内容配图预览" fill sizes="420px" className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-faint">
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
  onCancelGenerate,
  onSelectTopic,
  onSelectDraft,
  onConfigChange,
  onCoverGenerated,
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
    <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      <div className="grid border-b border-line lg:grid-cols-[1fr_auto]">
        <div className="px-4 py-3">
          <h2 className="font-bold text-ink">图片生成工作台</h2>
          <p className="mt-1 text-xs text-faint">
            {imageMode === "cover" ? "封面图" : activeContentTemplate.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 lg:border-l lg:border-t-0">
          <Button
            variant="ai"
            onClick={imageMode === "cover" ? onGenerateCover : onGenerateContentImage}
            loading={imageMode === "cover" ? isGenerating : isGeneratingContentImage}
            disabled={!hasSource}
            icon={<Sparkles size={15} />}
          >
            {imageMode === "cover"
              ? isGenerating ? "生成中" : "生成封面方案"
              : isGeneratingContentImage ? "生成中" : "生成内容图"}
          </Button>
          {(isGenerating || isGeneratingContentImage) && (
            <Button variant="ghost" onClick={onCancelGenerate}>
              取消
            </Button>
          )}
        </div>
      </div>

      <div className="grid border-b border-line bg-soft lg:grid-cols-[1.2fr_0.9fr_0.9fr]">
        <div className="border-b border-line p-4 lg:border-b-0 lg:border-r">
          <div className="text-xs font-bold text-faint">当前内容</div>
          <div className="mt-2 text-base font-bold leading-6 text-ink">{sourceTitle}</div>
        </div>
        <div className="border-b border-line p-4 lg:border-b-0 lg:border-r">
          <div className="text-xs font-bold text-brand-500">痛点</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-muted">
            {clip(sourceInput?.painPoint || imageSourceInput?.painPoint || selectedTopic?.painPoint)}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-bold text-ok">{assetLabel}</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-muted">
            {clip(assetText)}
          </div>
        </div>
      </div>

      {imageMode === "cover" ? (
        <>
          {coverVersions.length > 0 && (
            <div className="border-b border-line bg-white">
              <div className="grid gap-3 border-b border-line px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div>
                  <h3 className="font-bold text-ink">封面版本</h3>
                  <p className="mt-1 text-xs text-faint">
                    已保存 {coverVersions.length} 张
                  </p>
                </div>
                <div className="text-xs font-bold text-faint">
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
                      className={`w-28 flex-none rounded-2xl border p-2 text-left transition-colors sm:w-32 ${
                        isActive
                          ? "border-brand-300 bg-brand-50 text-ink"
                          : "border-line bg-soft text-ink hover:border-line-strong"
                      }`}
                    >
                      <CoverVersionThumbnail config={version.config} />
                      <div className="mt-2 text-[11px] font-bold text-faint">
                        {version.sourceType === "draft" ? "草稿封面" : "选题封面"}
                      </div>
                      <div className="mt-1 line-clamp-2 min-h-9 whitespace-pre-wrap text-xs font-bold leading-[18px]">
                        {version.title}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-bold text-faint">
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
            <div className="grid border-b border-line bg-white md:grid-cols-[0.7fr_1fr_1.4fr]">
              <div className="border-b border-line p-4 md:border-b-0 md:border-r">
                <div className="text-xs font-bold text-faint">AI 方案</div>
                <div className="mt-2 font-bold text-ink">{visibleCoverPlan.style}</div>
              </div>
              <div className="border-b border-line p-4 md:border-b-0 md:border-r">
                <div className="text-xs font-bold text-faint">建议大字</div>
                <div className="mt-2 whitespace-pre-wrap font-bold leading-6 text-ink">{visibleCoverPlan.title}</div>
              </div>
              <div className="p-4">
                <div className="text-xs font-bold text-faint">理由</div>
                <div className="mt-2 text-sm leading-6 text-muted">{visibleCoverPlan.reason}</div>
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
            <div className="overflow-hidden rounded-3xl border border-line bg-surface">
              <div className="border-b border-line px-4 py-3">
                <h3 className="font-bold text-ink">内容图类型</h3>
                <p className="mt-1 text-xs text-faint">{activeContentTemplate.description}</p>
              </div>
              <div className="grid gap-2 p-3 sm:grid-cols-2">
                {CONTENT_IMAGE_TEMPLATES.map((template) => {
                  const isActive = contentImageTemplate === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => onContentTemplateChange(template.id)}
                      className={`rounded-2xl border p-3 text-left transition-colors ${
                        isActive
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-white text-ink hover:border-line-strong"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-bold">{template.name}</span>
                        <span
                          className="h-5 w-5 rounded-md border border-line"
                          style={{
                            backgroundColor: template.defaultPalette.background,
                            borderColor: template.defaultPalette.primary,
                          }}
                        />
                      </div>
                      <div className={`mt-2 text-xs ${isActive ? "text-faint" : "text-faint"}`}>
                        {template.previewTone}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {contentImagePlan && (
              <div className="overflow-hidden rounded-3xl border border-line bg-surface">
                <div className="grid border-b border-line md:grid-cols-[0.8fr_1.2fr]">
                  <div className="border-b border-line p-4 md:border-b-0 md:border-r">
                    <div className="text-xs font-bold text-faint">图片方案</div>
                    <div className="mt-2 font-bold text-ink">{contentImagePlan.title}</div>
                    <div className="mt-1 text-xs font-bold text-ok">{getContentImageTemplate(contentImagePlan.templateType).name}</div>
                  </div>
                  <div className="p-4">
                    <div className="text-xs font-bold text-faint">摘要</div>
                    <div className="mt-2 text-sm font-semibold leading-6 text-muted">{contentImagePlan.summary}</div>
                  </div>
                </div>
                <div className="grid gap-2 p-3 sm:grid-cols-2">
                  {contentImagePlan.blocks.slice(0, 6).map((block) => (
                    <div key={block.id} className="rounded-2xl border border-line bg-soft p-3">
                      <div className="text-xs font-bold text-faint">{block.meta || block.lane || block.id}</div>
                      <div className="mt-1 text-sm font-bold text-ink">{block.title}</div>
                      <div className="mt-1 text-xs leading-5 text-muted">{block.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <ContentImagePreview plan={contentImagePlan} onGenerated={onContentImageGenerated} />
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="rounded-2xl border border-line bg-surface px-3 py-2.5">
                <div className="text-xs font-bold text-faint">当前类型</div>
                <div className="mt-1 text-sm font-bold text-ink">{activeContentTemplate.name}</div>
              </div>
              <button
                type="button"
                onClick={handleDownloadContentImage}
                disabled={!contentImageDataUrl}
                className="h-9 shrink-0 rounded-xl bg-ink px-4 text-sm font-bold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-sunken disabled:text-faint"
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
