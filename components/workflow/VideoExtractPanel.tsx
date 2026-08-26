"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import { Field, Textarea } from "@/components/ui/Field";
import { extractVideo } from "@/lib/workflowClient";
import {
  scriptAnalysisToDistillation,
  VIDEO_PLATFORM_LABEL,
  type VideoExtractResult,
} from "@/lib/videoExtract";
import { analysisToSkeleton, type BenchmarkSkeleton } from "@/lib/videoFactory";
import type { BloggerDistillation } from "@/lib/bloggerWorkflow";
import type { Notice } from "./types";

interface VideoExtractPanelProps {
  onNotice: (notice: Notice) => void;
  /** 一键把脚本结构沉淀成对标拆解道库 */
  onSinkToDaoku: (distillation: BloggerDistillation) => void;
  /** 沉淀后跳到对标拆解页 */
  onGoBlogger: () => void;
  /** 把结构骨架送进视频工厂，接着写自己的脚本 */
  onSendToVideoFactory: (skeleton: BenchmarkSkeleton) => void;
  /** 首页那句话里抠出来的链接，进来即填进输入框 */
  incomingUrl?: string | null;
  onUrlConsumed?: () => void;
}

function formatDuration(sec: number): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 大写小节标题 */
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{children}</div>
);

/** 结构卡里的字段小标题 */
const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-bold text-muted">{children}</div>
);

/** 拆片结果展示：result 存在即 video/analysis 齐全（皆为必填字段），无需再逐个判空。 */
function ResultView({
  result,
  onSink,
  onSendToVideoFactory,
}: {
  result: VideoExtractResult;
  onSink: () => void;
  onSendToVideoFactory: () => void;
}) {
  const { video, analysis } = result;
  return (
    <div className="space-y-5">
      {/* 视频 + 元信息 */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{VIDEO_PLATFORM_LABEL[video.platform]}</Badge>
          {video.author && <span className="text-xs text-faint">@{video.author}</span>}
          {video.durationSec > 0 && <span className="text-xs text-faint">{formatDuration(video.durationSec)}</span>}
        </div>
        {video.title && <div className="mt-2 text-base font-bold leading-6 text-ink">{video.title}</div>}
        <video
          controls
          src={video.videoUrl}
          poster={video.coverUrl || undefined}
          className="mt-3 w-full max-w-sm rounded-2xl border border-line bg-black"
        />
      </Card>

      {/* 平台文案 */}
      {video.desc && (
        <div className="rounded-3xl border border-line bg-soft p-5">
          <SectionTitle>平台文案</SectionTitle>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{video.desc}</p>
        </div>
      )}

      {/* 口播脚本 */}
      <div className="rounded-3xl border border-line bg-soft p-5">
        <SectionTitle>口播脚本</SectionTitle>
        {video.transcript ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{video.transcript}</p>
        ) : (
          <Callout tone="warn" className="mt-2">
            {video.transcriptNote || "没抓到口播脚本"}
          </Callout>
        )}
      </div>

      {/* 脚本结构拆解 */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <SectionTitle>脚本结构拆解</SectionTitle>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={onSink}>
              沉淀进对标拆解道库
            </Button>
            <Button variant="primary" onClick={onSendToVideoFactory}>
              送进视频工厂
            </Button>
          </div>
        </div>

        {analysis.hook && (
          <div className="mt-3">
            <FieldLabel>开头钩子</FieldLabel>
            <p className="mt-1 text-sm leading-6 text-ink">{analysis.hook}</p>
          </div>
        )}

        {analysis.structure.length > 0 && (
          <ol className="mt-3 space-y-2">
            {analysis.structure.map((stage, index) => (
              <li key={`${stage.stage}-${index}`} className="rounded-2xl border border-line bg-soft px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-brand-600">{stage.stage || `第 ${index + 1} 段`}</span>
                  {stage.purpose && <span className="text-xs text-muted">{stage.purpose}</span>}
                </div>
                {stage.text && <p className="mt-1 text-sm leading-6 text-ink">{stage.text}</p>}
              </li>
            ))}
          </ol>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {analysis.style && (
            <div>
              <FieldLabel>风格特征</FieldLabel>
              <p className="mt-1 text-sm leading-6 text-ink">{analysis.style}</p>
            </div>
          )}
          {analysis.painPoint && (
            <div>
              <FieldLabel>读者痛点</FieldLabel>
              <p className="mt-1 text-sm leading-6 text-ink">{analysis.painPoint}</p>
            </div>
          )}
        </div>

        {analysis.reusableTemplate && (
          <Callout tone="info" className="mt-3">
            可复用模板：{analysis.reusableTemplate}
          </Callout>
        )}
      </Card>
    </div>
  );
}

export default function VideoExtractPanel({
  onNotice,
  onSinkToDaoku,
  onGoBlogger,
  onSendToVideoFactory,
  incomingUrl,
  onUrlConsumed,
}: VideoExtractPanelProps) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<VideoExtractResult | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // 首页带来的链接直接填进去。输入框里已经有东西就不动——手上那条没拆完，不该被顶掉。
  useEffect(() => {
    if (!incomingUrl) return;
    setInput((current) => current.trim() || incomingUrl);
    onUrlConsumed?.();
  }, [incomingUrl, onUrlConsumed]);

  const handleExtract = async () => {
    const text = input.trim();
    if (!text) {
      onNotice({ type: "error", message: "请粘贴一条抖音/小红书视频链接或分享口令" });
      return;
    }
    setIsExtracting(true);
    onNotice({ type: "info", message: "正在拉取视频并转写脚本，稍等片刻" });
    try {
      const data = await extractVideo(text);
      setResult(data);
      onNotice({
        type: data.usedFallback ? "info" : "success",
        message: data.usedFallback
          ? "已抓到视频，但未配置 AI，脚本结构请手动拆解"
          : `已从${VIDEO_PLATFORM_LABEL[data.video.platform]}拆出视频与脚本结构`,
      });
    } catch (error) {
      console.error("[VideoExtractPanel] 拆片失败", { action: "video.extract", error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "视频拆片失败" });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSink = () => {
    if (!result) return;
    onSinkToDaoku(scriptAnalysisToDistillation(result.video, result.analysis));
    onNotice({ type: "success", message: "已沉淀进对标拆解道库" });
    onGoBlogger();
  };

  /** 只把结构送下游：原句和原画面留在这一页，不进改写环节。 */
  const handleSendToVideoFactory = () => {
    if (!result) return;
    onSendToVideoFactory(
      analysisToSkeleton(result.analysis, {
        platform: VIDEO_PLATFORM_LABEL[result.video.platform],
        author: result.video.author,
        title: result.video.title,
        videoUrl: result.video.videoUrl,
      }),
    );
  };

  return (
    <div className="space-y-5">
      <Card>
        <Field
          label="视频链接 / 分享口令"
          hint="粘贴抖音分享口令（含链接即可，会自动抠出）或视频网页地址。抓取在本地服务完成，需先启动 services/video-renderer 并装好 yt-dlp / ffmpeg。"
        >
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={3}
            placeholder="例：7.68 复制打开抖音，看看这个视频 https://v.douyin.com/xxxxx/"
          />
        </Field>
        <div className="mt-3">
          <Button variant="primary" onClick={handleExtract} loading={isExtracting} disabled={!input.trim()}>
            {isExtracting ? "拆片中" : "提取视频与脚本"}
          </Button>
        </div>
      </Card>

      {result && <ResultView result={result} onSink={handleSink} onSendToVideoFactory={handleSendToVideoFactory} />}
    </div>
  );
}
