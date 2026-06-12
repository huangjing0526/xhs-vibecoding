"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import SegmentedControl from "./SegmentedControl";
import type { BloggerDistillation } from "@/lib/bloggerWorkflow";
import {
  createFallbackVideoPlan,
  draftToVideoSourceInput,
  topicToVideoSourceInput,
  type VideoDuration,
  type VideoFormat,
  type VideoPace,
  type VideoPlan,
  type VideoRenderResult,
  type VideoRenderStatus,
} from "@/lib/videoWorkflow";
import type { ContentCard, DraftNote } from "@/lib/xhsWorkflow";

interface VideoStudioProps {
  selectedTopic: ContentCard | null;
  selectedDraft: DraftNote | null;
  bloggerDistillation: BloggerDistillation | null;
  onVideoPlanChange: (plan: VideoPlan) => void;
  /** 图片生成环节产出的封面/内容图（data URL），作为各屏背景复用 */
  imageUrls?: string[];
  /** 成片状态回流给总览/上下文 */
  onRenderedChange?: (rendered: boolean) => void;
}

function formatLabel(format: VideoFormat): string {
  if (format === "flash_cards") return "图文快闪";
  if (format === "screen_recording") return "教程录屏";
  if (format === "story") return "剧情反差";
  return "口播";
}

export default function VideoStudio({
  selectedTopic,
  selectedDraft,
  bloggerDistillation,
  onVideoPlanChange,
  imageUrls = [],
  onRenderedChange,
}: VideoStudioProps) {
  const [format, setFormat] = useState<VideoFormat>("talking_head");
  const [duration, setDuration] = useState<VideoDuration>("60s");
  const [pace, setPace] = useState<VideoPace>("steady");
  const [plan, setPlan] = useState<VideoPlan | null>(null);
  const [renderStatus, setRenderStatus] = useState<VideoRenderStatus>("idle");
  const [renderResult, setRenderResult] = useState<VideoRenderResult | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const input = useMemo(() => {
    if (selectedDraft) return draftToVideoSourceInput(selectedDraft);
    if (selectedTopic) return topicToVideoSourceInput(selectedTopic);
    return null;
  }, [selectedDraft, selectedTopic]);

  const handleGenerate = () => {
    if (!input) return;
    const nextPlan = createFallbackVideoPlan(input, bloggerDistillation, format, duration, pace);
    setPlan(nextPlan);
    onVideoPlanChange(nextPlan);
    // 方案变了，旧成片作废
    setRenderResult(null);
    setRenderError(null);
    setRenderStatus("idle");
    onRenderedChange?.(false);
  };

  const handleRender = async () => {
    if (!plan) return;
    setRenderStatus("rendering");
    setRenderError(null);
    setRenderResult(null);
    onRenderedChange?.(false);
    try {
      const resp = await fetch("/api/video/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, imageUrls }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || "渲染失败");
      }
      setRenderResult(data as VideoRenderResult);
      setRenderStatus("done");
      onRenderedChange?.(true);
      toast.success("视频已渲染完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : "渲染失败";
      console.error("[VideoStudio] 渲染失败", {
        userId: "local",
        tenantId: "local",
        action: "video.render",
        planId: plan.id,
        message,
      });
      setRenderError(message);
      setRenderStatus("error");
      toast.error(message);
    }
  };

  const handleCopy = async (label: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}已复制`);
    } catch (error) {
      console.error("[VideoStudio] 复制失败", {
        userId: "local",
        tenantId: "local",
        action: "video.copy",
        error,
      });
      toast.error("复制失败，请手动选择内容复制");
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-[#E5E5EA] bg-white p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#1D1D1F]">视频参数</h3>
            <p className="mt-1 text-sm text-[#6E6E73]">先「生成视频方案」出脚本/分镜/字幕，再「渲染成片」用本地 Remotion + edge-tts 配音出 mp4。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              value={format}
              onChange={setFormat}
              ariaLabel="视频形态"
              compact
              options={[
                { value: "talking_head", label: "口播" },
                { value: "flash_cards", label: "快闪" },
                { value: "screen_recording", label: "录屏" },
                { value: "story", label: "剧情" },
              ]}
            />
            <SegmentedControl
              value={duration}
              onChange={setDuration}
              ariaLabel="视频时长"
              compact
              options={[
                { value: "30s", label: "30s" },
                { value: "60s", label: "60s" },
                { value: "90s", label: "90s" },
              ]}
            />
            <SegmentedControl
              value={pace}
              onChange={setPace}
              ariaLabel="视频节奏"
              compact
              options={[
                { value: "steady", label: "稳" },
                { value: "fast", label: "快" },
              ]}
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!input}
              className="rounded-lg bg-[#FF2442] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(255,36,66,0.18)] disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6] disabled:shadow-none"
            >
              生成视频方案
            </button>
            <button
              type="button"
              onClick={handleRender}
              disabled={!plan || renderStatus === "rendering"}
              className="rounded-lg border border-[#1D1D1F] bg-[#1D1D1F] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:border-[#E5E5EA] disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6]"
            >
              {renderStatus === "rendering" ? "渲染中..." : "渲染成片"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-[#A1A1A6]">
          渲染成片需先在 <code className="rounded bg-[#F5F5F7] px-1">services/video-renderer</code> 启动本地渲染服务（Remotion + edge-tts 配音）。
        </p>
      </div>

      {(renderStatus !== "idle" || renderResult) && (
        <div className="rounded-lg border border-[#E5E5EA] bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#1D1D1F]">成片预览</h3>
            {renderResult && (
              <a
                href={renderResult.videoUrl}
                download
                className="rounded-md border border-[#D2D2D7] px-3 py-1.5 text-xs font-semibold text-[#1D1D1F]"
              >
                下载 mp4
              </a>
            )}
          </div>

          {renderStatus === "rendering" && (
            <div className="mt-3 flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-[#D2D2D7] text-sm text-[#6E6E73]">
              正在配音 + 渲染，首次会先打包 Remotion 工程，请稍候…
            </div>
          )}

          {renderStatus === "error" && (
            <div className="mt-3 rounded-lg border border-[#F3C9CF] bg-[#FFF1F3] p-3 text-sm leading-6 text-[#B91C2B]">
              {renderError}
            </div>
          )}

          {renderResult && renderStatus === "done" && (
            <div className="mt-3">
              <video
                key={renderResult.videoUrl}
                src={renderResult.videoUrl}
                controls
                className="mx-auto max-h-[640px] rounded-lg border border-[#E5E5EA] bg-black"
              />
              <p className="mt-2 text-center text-xs text-[#A1A1A6]">
                时长约 {Math.round(renderResult.durationSec)}s · {renderResult.videoUrl}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-[#E5E5EA] bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A1A1A6]">Video Plan</div>
          <h3 className="mt-2 text-xl font-semibold text-[#1D1D1F]">
            {plan ? formatLabel(plan.format) : "待生成方案"}
          </h3>
          <div className="mt-4 space-y-2 text-sm text-[#6E6E73]">
            <div className="rounded-lg bg-[#F5F5F7] px-3 py-2">Hook</div>
            <div className="rounded-lg bg-[#F5F5F7] px-3 py-2">口播稿</div>
            <div className="rounded-lg bg-[#F5F5F7] px-3 py-2">分镜</div>
            <div className="rounded-lg bg-[#F5F5F7] px-3 py-2">字幕</div>
            <div className="rounded-lg bg-[#F5F5F7] px-3 py-2">Prompt</div>
          </div>
        </aside>

        <section className="rounded-lg border border-[#E5E5EA] bg-white p-4">
          {plan ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-[#FFF1F3] p-4">
                <div className="text-xs font-semibold text-[#FF2442]">Hook</div>
                <p className="mt-2 text-lg font-semibold leading-7 text-[#1D1D1F]">{plan.hook}</p>
              </div>

              <div className="rounded-lg border border-[#E5E5EA] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-[#1D1D1F]">口播稿</h4>
                  <button
                    type="button"
                    onClick={() => handleCopy("口播稿", plan.voiceover)}
                    className="rounded-md border border-[#D2D2D7] px-3 py-1.5 text-xs font-semibold text-[#1D1D1F]"
                  >
                    复制
                  </button>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#1D1D1F]">{plan.voiceover}</p>
              </div>

              <div className="rounded-lg border border-[#E5E5EA] p-4">
                <h4 className="text-sm font-semibold text-[#1D1D1F]">分镜脚本</h4>
                <div className="mt-3 divide-y divide-[#E5E5EA]">
                  {plan.scenes.map((scene) => (
                    <div key={scene.order} className="grid gap-3 py-3 md:grid-cols-[64px_1fr_1fr_88px]">
                      <div className="text-sm font-semibold tabular-nums text-[#FF2442]">0{scene.order}</div>
                      <div className="text-sm leading-6 text-[#1D1D1F]">{scene.visual}</div>
                      <div className="text-sm leading-6 text-[#6E6E73]">{scene.subtitle}</div>
                      <div className="text-sm font-semibold text-[#A1A1A6]">{scene.durationHint}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-[#E5E5EA] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-[#1D1D1F]">视频生成 Prompt</h4>
                  <button
                    type="button"
                    onClick={() => handleCopy("Prompt", plan.generationPrompt)}
                    className="rounded-md border border-[#D2D2D7] px-3 py-1.5 text-xs font-semibold text-[#1D1D1F]"
                  >
                    复制
                  </button>
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-[#F5F5F7] p-3 text-sm leading-7 text-[#1D1D1F]">
                  {plan.generationPrompt}
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-[#D2D2D7] text-center text-sm leading-6 text-[#6E6E73]">
              {input ? "点击「生成视频方案」输出脚本和 Prompt。" : "先选择选题或草稿。"}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
