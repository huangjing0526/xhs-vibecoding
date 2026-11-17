"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download, Image as ImageIcon, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ChipRow from "@/components/mobile/ChipRow";
import MobileToolPage from "@/components/mobile/MobileToolPage";
import NotePicker from "@/components/mobile/NotePicker";
import { findDraftForTopic, useWorkflowData } from "@/components/mobile/useWorkflowData";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import { noteTitle } from "@/components/workflow/NoteList";
import { useContentImagePreview } from "@/components/workflow/useContentImagePreview";
import { recallTopic } from "@/lib/mobile/selection";
import { downloadCover, generateCoverDataUrl } from "@/lib/cover";
import { contentCardToCoverInput, draftToCoverInput } from "@/lib/coverWorkflow";
import {
  CONTENT_IMAGE_TEMPLATES,
  contentCardToImageSourceInput,
  downloadImageAsset,
  draftToImageSourceInput,
  type ContentImagePlan,
  type ContentImageTemplateType,
} from "@/lib/imageWorkflow";
import { DEFAULT_TARGET_ID, assetPx, assetRatioCss } from "@/lib/targets";
import { generateCover, generateImageAsset, getNoteAssets, saveNoteAssets } from "@/lib/workflowClient";
import type { ContentCard } from "@/lib/xhsWorkflow";

type ImageMode = "cover" | "content";

const MODE_OPTIONS = [
  { value: "cover" as const, label: "封面" },
  { value: "content" as const, label: "内容图" },
];

/**
 * 封面配图（移动版）：选笔记 → 生成 → 存图，三步走完。
 *
 * 没有复用桌面端的 CoverStudio：那是「左侧参数面板 + 右侧画布 + 版本列表」的三栏编辑器，
 * 手机塞不下也不该塞。这里只保留出图和保存，微调仍回桌面端做。
 * 图片一律不写回飞书——手机上多是随手试，不该覆盖记录里已有的封面方案。
 */
export default function MobileCoverPage() {
  const { topics, drafts, loading } = useWorkflowData();
  const [topic, setTopic] = useState<ContentCard | null>(null);
  const [mode, setMode] = useState<ImageMode>("cover");
  const [coverUrl, setCoverUrl] = useState("");
  const [contentPlan, setContentPlan] = useState<ContentImagePlan | null>(null);
  const [templateType, setTemplateType] = useState<ContentImageTemplateType>(CONTENT_IMAGE_TEMPLATES[0].id);
  const [generating, setGenerating] = useState(false);

  // 从作品页点「做封面」进来时沿用那条笔记，否则默认第一条
  useEffect(() => {
    if (topic || topics.length === 0) return;
    const remembered = recallTopic();
    setTopic(topics.find((item) => item.topicId === remembered) ?? topics[0]);
  }, [topic, topics]);

  const topicId = topic?.topicId;
  useEffect(() => {
    setContentPlan(null);
    if (!topicId) return;
    let active = true;
    getNoteAssets(topicId).then((assets) => {
      if (active) setContentPlan(assets.contentImagePlan ?? null);
    }).catch((error) => {
      console.error("[MobileCover] Asset load failed", { action: "notes.assets.read", topicId, error });
      toast.error(error instanceof Error ? error.message : "配图方案读取失败");
    });
    return () => { active = false; };
  }, [topicId]);

  const draft = findDraftForTopic(drafts, topic);
  // 封面在浏览器画（与桌面 CoverStudio 同一条路径），这块画布只作渲染中转
  const coverCanvasRef = useRef<HTMLCanvasElement>(null);

  const handlePreviewError = useCallback((message: string) => toast.error(message), []);
  const { canvasRef, dataUrl: contentUrl } = useContentImagePreview({
    plan: contentPlan,
    px: assetPx(DEFAULT_TARGET_ID, "content"),
    onError: handlePreviewError,
  });

  const switchTopic = (next: ContentCard) => {
    // 换了笔记，之前那张图就不是这篇的了，清掉免得误存
    setTopic(next);
    setCoverUrl("");
    setContentPlan(null);
  };

  const handleGenerate = async () => {
    if (!topic || generating) return;

    setGenerating(true);
    try {
      if (mode === "cover") {
        const result = await generateCover({
          input: draft ? draftToCoverInput(draft) : contentCardToCoverInput(topic),
          writeBack: false,
        });

        if (!coverCanvasRef.current) {
          throw new Error("画布还没准备好，请重试");
        }
        // 服务端也能出图（renderImage），但那条路依赖 wasm 渲染器，本地跑不通；
        // 画布这条与桌面工作台完全一致，出来的图也一致
        const dataUrl = await generateCoverDataUrl(
          coverCanvasRef.current,
          result.coverConfig,
          assetPx(DEFAULT_TARGET_ID, "cover")
        );
        setCoverUrl(dataUrl);
        if (result.usedFallback) toast.info("未检测到 AI 配置，已用规则生成封面");
        return;
      }

      const result = await generateImageAsset({
        kind: "content",
        input: draft ? draftToImageSourceInput(draft) : contentCardToImageSourceInput(topic),
        templateType,
      });
      await saveNoteAssets(topic.topicId, { contentImagePlan: result.plan });
      setContentPlan(result.plan);
      if (result.usedFallback) toast.info("未检测到 AI 配置，已用规则生成配图");
    } catch (error) {
      console.error("[MobileCoverPage] 出图失败", {
        action: mode === "cover" ? "mobile.cover.generate" : "mobile.contentImage.generate",
        topicId: topic.topicId,
        templateType,
        error,
      });
      toast.error(error instanceof Error ? error.message : "出图失败，请稍后重试");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!topic) return;
    const name = noteTitle(topic).slice(0, 20);

    if (mode === "cover") {
      downloadCover(coverUrl, `${name}-封面.png`);
      return;
    }
    downloadImageAsset(contentUrl, `${name}-配图.png`);
  };

  const currentUrl = mode === "cover" ? coverUrl : contentUrl;

  if (topics.length === 0 && !loading) {
    return (
      <MobileToolPage title="封面配图" subtitle="封面 · 内容图">
        <EmptyState
          icon={<ImageIcon size={22} />}
          title="还没有可用的笔记"
          description="图片从笔记内容来。先去拆一条爆款视频，或用模板出一版内容。"
          action={
            <Link href="/m/create" className="rounded-xl bg-ink px-4 py-2 text-[13px] font-bold text-white">
              去创作
            </Link>
          }
        />
      </MobileToolPage>
    );
  }

  return (
    <MobileToolPage title="封面配图" subtitle="出图后长按或点下载保存到相册">
      <div className="space-y-4">
        <fieldset disabled={generating}><NotePicker topics={topics} drafts={drafts} value={topic} onChange={switchTopic} /></fieldset>

        <SegmentedControl value={mode} options={MODE_OPTIONS} onChange={setMode} ariaLabel="图片类型" compact />

        {mode === "content" && (
          <ChipRow
            value={templateType}
            options={CONTENT_IMAGE_TEMPLATES.map((template) => ({ id: template.id, label: template.name }))}
            onChange={(next) => {
              setTemplateType(next);
              setContentPlan(null);
            }}
            ariaLabel="配图模板"
          />
        )}

        <div
          className="flex items-center justify-center overflow-hidden rounded-3xl border border-line bg-surface shadow-card"
          style={{ aspectRatio: assetRatioCss(DEFAULT_TARGET_ID, mode === "cover" ? "cover" : "content") }}
        >
          {currentUrl ? (
            // 生成结果是 data URL，交给 next/image 反而要放开域名与优化配置，直接用 img
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt={mode === "cover" ? "封面预览" : "内容配图预览"} className="h-full w-full object-contain" />
          ) : (
            <p className="px-6 text-center text-[12px] font-medium leading-5 text-faint">
              {generating ? "正在出图，稍等片刻" : "点下面的按钮，用这篇笔记的内容出一张图"}
            </p>
          )}
        </div>

        {/* 两种图都在浏览器画布上渲染，画完取 dataUrl，画布本身不展示 */}
        <canvas ref={coverCanvasRef} className="hidden" />
        <canvas ref={canvasRef} className="hidden" />

        <div className="flex gap-2">
          <Button
            block
            size="lg"
            variant="ai"
            onClick={handleGenerate}
            loading={generating}
            disabled={!topic}
            icon={<Sparkles size={15} strokeWidth={2.4} />}
          >
            {generating ? "生成中" : currentUrl ? "换一版" : "生成图片"}
          </Button>

          {currentUrl && (
            <Button size="lg" variant="secondary" onClick={handleDownload} icon={<Download size={15} />}>
              保存
            </Button>
          )}
        </div>
      </div>
    </MobileToolPage>
  );
}
