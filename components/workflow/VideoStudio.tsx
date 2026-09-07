"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Clapperboard, Copy, Download, Film, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import EmptyState from "@/components/ui/EmptyState";
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
  /** 一键将当前文案/脚本送往视频工厂 */
  onSendToVideoFactory?: (topic: string) => void;
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
  onSendToVideoFactory,
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
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-[15px] font-bold text-ink">视频参数</h3>
            <p className="mt-1 text-sm leading-6 text-muted">先「生成视频脚本」出脚本/分镜/字幕，再「渲染成片」用本地 Remotion + edge-tts 配音出 mp4。</p>
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
            <Button variant="ai" onClick={handleGenerate} disabled={!input} icon={<Sparkles size={15} />}>
              生成视频脚本
            </Button>
            <Button
              variant="primary"
              onClick={handleRender}
              disabled={!plan}
              loading={renderStatus === "rendering"}
              icon={<Clapperboard size={15} />}
            >
              {renderStatus === "rendering" ? "渲染中" : "渲染成片"}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-faint">
          渲染成片需先在 <code className="rounded-md bg-soft px-1.5 py-0.5 font-mono">services/video-renderer</code> 启动本地渲染服务（Remotion + edge-tts 配音）。
        </p>
      </div>

      {(renderStatus !== "idle" || renderResult) && (
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-ink">成片预览</h3>
            {renderResult && (
              <a
                href={renderResult.videoUrl}
                download
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-xs font-bold text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                <Download size={13} />
                下载 mp4
              </a>
            )}
          </div>

          {renderStatus === "rendering" && (
            <div className="mt-3 flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-line-strong text-sm text-muted">
              正在配音 + 渲染，首次会先打包 Remotion 工程，请稍候…
            </div>
          )}

          {renderStatus === "error" && (
            <Callout tone="warn" className="mt-3">
              {renderError}
            </Callout>
          )}

          {renderResult && renderStatus === "done" && (
            <div className="mt-3">
              <video
                key={renderResult.videoUrl}
                src={renderResult.videoUrl}
                controls
                className="mx-auto max-h-[640px] rounded-2xl border border-line bg-black"
              />
              <p className="mt-2 text-center text-xs text-faint">
                时长约 {Math.round(renderResult.durationSec)}s · {renderResult.videoUrl}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-line bg-surface p-5 shadow-card">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">视频方案</div>
          <h3 className="mt-2 font-rounded text-xl font-bold text-ink">
            {plan ? formatLabel(plan.format) : "待生成方案"}
          </h3>
          <div className="mt-4 space-y-2 text-sm text-muted">
            <div className="rounded-xl bg-soft px-3 py-2">开头钩子</div>
            <div className="rounded-xl bg-soft px-3 py-2">口播稿</div>
            <div className="rounded-xl bg-soft px-3 py-2">分镜</div>
            <div className="rounded-xl bg-soft px-3 py-2">字幕</div>
            <div className="rounded-xl bg-soft px-3 py-2">生成 Prompt</div>
          </div>

          {onSendToVideoFactory && (
            <div className="mt-5 border-t border-line pt-4">
              <Button
                size="sm"
                variant="secondary"
                block
                onClick={() => {
                  const topicText = plan?.voiceover || input?.content || input?.title || "";
                  onSendToVideoFactory(topicText);
                }}
                icon={<Film size={13} className="text-brand-500" />}
              >
                进视频工厂出片
              </Button>
              <p className="mt-1.5 text-center text-[10px] text-faint">
                带当前文案进入视频工厂逐镜生成 AI 视频
              </p>
            </div>
          )}
        </aside>

        <section className="rounded-3xl border border-line bg-surface p-5 shadow-card">
          {plan ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-brand-50 p-4">
                <div className="text-xs font-bold text-brand-600">开头钩子</div>
                <p className="mt-2 text-lg font-bold leading-7 text-ink">{plan.hook}</p>
              </div>

              <div className="rounded-2xl border border-line p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-bold text-ink">口播稿</h4>
                  <Button size="sm" variant="secondary" onClick={() => handleCopy("口播稿", plan.voiceover)} icon={<Copy size={13} />}>
                    复制
                  </Button>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink">{plan.voiceover}</p>
              </div>

              <div className="rounded-2xl border border-line p-4">
                <h4 className="text-sm font-bold text-ink">分镜脚本</h4>
                <div className="mt-3 divide-y divide-line">
                  {plan.scenes.map((scene) => (
                    <div key={scene.order} className="grid gap-3 py-3 md:grid-cols-[64px_1fr_1fr_88px]">
                      <div className="font-rounded text-sm font-bold tabular-nums text-brand-500">0{scene.order}</div>
                      <div className="text-sm leading-6 text-ink">{scene.visual}</div>
                      <div className="text-sm leading-6 text-muted">{scene.subtitle}</div>
                      <div className="text-sm font-semibold text-faint">{scene.durationHint}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-line p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-bold text-ink">视频生成 Prompt</h4>
                  <Button size="sm" variant="secondary" onClick={() => handleCopy("Prompt", plan.generationPrompt)} icon={<Copy size={13} />}>
                    复制
                  </Button>
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-soft p-4 font-mono text-xs leading-6 text-ink">
                  {plan.generationPrompt}
                </pre>
              </div>
            </div>
          ) : (
            <div className="min-h-[520px]">
              <EmptyState
                icon={<Clapperboard size={22} />}
                title={input ? "还没有视频方案" : "先选择选题或草稿"}
                description={input ? "点上方「生成视频脚本」，输出钩子、口播稿、分镜与生成 Prompt。" : undefined}
              />
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
