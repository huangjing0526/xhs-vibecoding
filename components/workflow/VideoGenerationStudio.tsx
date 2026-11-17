"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import ChipRow from "@/components/mobile/ChipRow";
import ImagePicker from "@/components/mobile/ImagePicker";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import {
  DEFAULT_OPENING_SEC,
  DEFAULT_VOICE,
  I2V_PRICE,
  OPENING_OPTIONS,
  VOICE_OPTIONS,
  estimateAvatar,
  estimateProduct,
  estimateSeconds,
  type AvatarResolution,
  type I2VProvider,
  type VideoGenJob,
  type VideoGenMode,
} from "@/lib/videoGen";
import { getVideoJob, startVideoGeneration } from "@/lib/workflowClient";
import { startVideoJobPolling } from "@/lib/videoJobPolling";

const MODE_OPTIONS = [
  { value: "local" as const, label: "免费预览" },
  { value: "avatar" as const, label: "数字人口播" },
  { value: "product" as const, label: "产品展示" },
];

const RESOLUTIONS: AvatarResolution[] = ["480P", "720P"];
const PROVIDERS: Array<{ id: I2VProvider; label: string }> = [
  { id: "bailian", label: "百炼 flash（便宜）" },
  { id: "siliconflow", label: "硅基流动" },
];
const MAX_IMAGES = 6;
const POLL_INTERVAL_MS = 5000;

/**
 * 一键出片：上传图 + 写脚本 → 生成短视频。
 *
 * 三档共用一个页面，因为用户的输入完全一样（图 + 脚本 + 音色），差别只在背后调什么：
 * - 免费预览：纯本地合成，静态画面 + 配音字幕，一两分钟出片、零成本，嘴不会动；
 * - 数字人口播：百炼 wan2.2-s2v 出对口型，按秒计费；
 * - 产品展示：图生视频出画面再合成，默认百炼 flash 档。
 *
 * 默认落在免费预览：生成一条数字人几十块、还要等十几分钟，而脚本和节奏通常要改几版。
 * 先用免费档把内容定下来，满意了再一键跑付费版，省下的是真金白银。
 *
 * 生成是分钟级的，所以建任务后只轮询进度，页面停在这儿等——离开页面任务不会中断，
 * 但当前这版没有做任务列表，回来就找不到了，所以进度里把预计时间说清楚。
 */
export default function VideoGenerationStudio() {
  const [mode, setMode] = useState<VideoGenMode>("local");
  const [images, setImages] = useState<string[]>([]);
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [resolution, setResolution] = useState<AvatarResolution>("480P");
  const [provider, setProvider] = useState<I2VProvider>("bailian");
  const [openingSec, setOpeningSec] = useState<number>(DEFAULT_OPENING_SEC);
  const [prompt, setPrompt] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<VideoGenJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [pollRevision, setPollRevision] = useState(0);

  const submitting = useRef(false);
  const running = Boolean(jobId) || starting;
  const avatarEstimate = useMemo(
    () => estimateAvatar(script, resolution, openingSec),
    [script, resolution, openingSec]
  );

  // 切档不动已传的图：「先免费预览、满意了再跑付费版」是主路径，清空会让用户重传一遍。
  // 数字人档把第一张当形象图、其余当开场后的画面图，页面上用两个选择器把这个划分摊开给用户看。
  const switchMode = useCallback((next: VideoGenMode) => {
    if (running || next === mode) return;
    setMode(next);
    setJob(null);
    setJobId(null);
  }, [running, mode]);

  const stopTracking = useCallback(() => {
    setJobId(null);
    setJob(null);
    setPollingError(null);
    toast.info("已停止跟踪，不会取消后台任务；重新生成可能产生重复费用");
  }, []);

  useEffect(() => {
    if (!jobId) return;
    return startVideoJobPolling({
      jobId,
      query: getVideoJob,
      intervalMs: POLL_INTERVAL_MS,
      onJob(next) {
        setJob(next);
        if (next.state === "done") toast.success("视频生成完成");
        if (next.state === "error") toast.error(next.error || "生成失败");
        if (next.state !== "running") setJobId(null);
      },
      onPause(error) {
        console.error("[MobileClipPage] 任务状态查询失败", {
          action: "mobile.video.pollJob",
          jobId,
          error,
        });
        const message = error instanceof Error ? error.message : "任务状态查询失败";
        toast.error(message);
        setPollingError(message);
      },
    });
  }, [jobId, pollRevision]);

  const startGeneration = async (targetMode: VideoGenMode) => {
    if (running || submitting.current) return;
    if (!script.trim()) {
      toast.error("先写一段口播脚本");
      return;
    }
    if (images.length === 0) {
      toast.error(targetMode === "avatar" ? "先上传一张人物形象图" : "先上传图片");
      return;
    }

    submitting.current = true;
    setStarting(true);
    setJob(null);
    setPollingError(null);
    try {
      const { jobId: id } = await startVideoGeneration({
        mode: targetMode,
        script,
        voice,
        ...(targetMode === "avatar"
          ? { image: images[0], images: images.slice(1), resolution, openingSec }
          : targetMode === "product"
            ? { images, prompt: prompt.trim() || undefined, provider }
            : { images }),
      });
      setJob({ id, kind: targetMode, state: "running", stage: "等待任务状态", step: 0, totalSteps: 1, result: null, error: null });
      setJobId(id);
      toast.info(
        targetMode === "local" ? "本地合成中，通常一两分钟" : "任务已提交，生成期间请留在这个页面"
      );
    } catch (error) {
      console.error("[MobileClipPage] 创建生成任务失败", {
        action: "mobile.video.start",
        mode: targetMode,
        imageCount: images.length,
        error,
      });
      toast.error(error instanceof Error ? error.message : "任务创建失败");
    } finally {
      submitting.current = false;
      setStarting(false);
    }
  };

  const result = job?.state === "done" ? job.result : null;

  return (
    <section className="space-y-4">
      <div className="space-y-5">
        <fieldset disabled={running}><SegmentedControl value={mode} options={MODE_OPTIONS} onChange={switchMode} ariaLabel="出片模式" compact /></fieldset>

        {mode === "avatar" ? (
          <>
            <ImagePicker
              value={images.slice(0, 1)}
              onChange={(next) => setImages([...next, ...images.slice(1)])}
              max={1}
              label="人物形象图"
              hint="正面清晰、最短边 400px 以上"
            />

            {openingSec > 0 && (
              <ImagePicker
                value={images.slice(1)}
                onChange={(next) => setImages([...images.slice(0, 1), ...next])}
                max={MAX_IMAGES}
                label="开场之后的画面图"
                hint="不传就定格在形象图上，建议配 2-4 张"
              />
            )}
          </>
        ) : (
          <ImagePicker
            value={images}
            onChange={setImages}
            max={MAX_IMAGES}
            label={mode === "product" ? "产品图" : "画面图"}
            hint={
              mode === "product"
                ? `每张出一段画面，最多 ${MAX_IMAGES} 张`
                : `每张占一屏，缓慢推近，最多 ${MAX_IMAGES} 张`
            }
          />
        )}

        <Field
          label="口播脚本"
          hint={
            mode === "avatar"
              ? "配音由系统合成，不用自己录。超过 19 秒会自动分段生成再拼接"
              : "配音会铺在画面上，并自动切成字幕"
          }
        >
          <Textarea
            rows={6}
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder="例：很多人做 AI 视频，第一步就搞错了——先想工具，再想内容。我一般反过来……"
          />
        </Field>

        <div>
          <span className="mb-2 block text-xs font-bold text-muted">配音音色</span>
          <ChipRow
            value={voice}
            options={VOICE_OPTIONS.map((item) => ({ id: item.id, label: item.label }))}
            onChange={setVoice}
            ariaLabel="配音音色"
          />
        </div>

        {mode === "avatar" && (
          <div>
            <span className="mb-2 block text-xs font-bold text-muted">出镜方式</span>
            <ChipRow
              value={String(openingSec)}
              options={OPENING_OPTIONS.map((item) => ({ id: String(item.sec), label: item.label }))}
              onChange={(next) => setOpeningSec(Number(next))}
              ariaLabel="出镜方式"
            />
            <p className="mt-1.5 text-[11px] font-medium leading-4 text-faint">
              {openingSec > 0
                ? "只有开场这几秒按秒计费，后面切画面图，配音全程连续——比全程出镜省九成以上"
                : "整条都是真人对口型，按整条时长计费"}
            </p>
          </div>
        )}

        {mode === "avatar" && (
          <div>
            <span className="mb-2 block text-xs font-bold text-muted">清晰度</span>
            <ChipRow
              value={resolution}
              options={RESOLUTIONS.map((item) => ({ id: item, label: item }))}
              onChange={setResolution}
              ariaLabel="清晰度"
            />
          </div>
        )}

        {mode === "product" && (
          <>
            <div>
              <span className="mb-2 block text-xs font-bold text-muted">生视频模型</span>
              <ChipRow value={provider} options={PROVIDERS} onChange={setProvider} ariaLabel="生视频模型" />
            </div>

            <Field label="画面提示（选填）" hint="描述你想要的运镜和氛围，留空用默认的稳定推近">
              <Input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="例：镜头缓慢环绕，暖光，桌面场景"
              />
            </Field>
          </>
        )}

        {script.trim() && (
          <div className="rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-card">
            {mode === "local" && (
              <>
                <p className="text-[12px] font-bold text-ink">
                  预估 {estimateSeconds(script)} 秒 · 不花钱
                </p>
                <p className="mt-1 text-[11px] font-medium leading-4 text-faint">
                  本机合成，通常一两分钟出片。画面是静态图，人物嘴不会动——先用它把脚本和节奏定下来。
                </p>
              </>
            )}

            {mode === "avatar" && (
              <>
                <p className="text-[12px] font-bold text-ink">
                  成片约 {avatarEstimate.seconds} 秒 · 计费 {avatarEstimate.billedSeconds} 秒 · 约 ¥
                  {avatarEstimate.yuan}
                </p>
                <p className="mt-1 text-[11px] font-medium leading-4 text-faint">
                  {openingSec > 0
                    ? `只有开场 ${avatarEstimate.billedSeconds} 秒计费；全程出镜要 ¥${(avatarEstimate.seconds * (resolution === "480P" ? 0.5 : 0.9)).toFixed(2)}。`
                    : "按整条配音时长计费。"}
                  （{resolution} {resolution === "480P" ? "0.5" : "0.9"} 元/秒）预计等待{" "}
                  {avatarEstimate.minutesLow}-{avatarEstimate.minutesHigh} 分钟。
                </p>
              </>
            )}

            {mode === "product" && (
              <>
                <p className="text-[12px] font-bold text-ink">
                  {images.length || 1} 段画面 · 约 ¥{estimateProduct(images.length, provider)}
                </p>
                <p className="mt-1 text-[11px] font-medium leading-4 text-faint">
                  {I2V_PRICE[provider].label}，一张图出一段 5 秒画面。
                </p>
              </>
            )}
          </div>
        )}

        {job && job.state !== "done" && (
          <div className="rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-bold text-ink">{job.stage}</span>
              {job.totalSteps > 1 && (
                <span className="shrink-0 font-rounded text-[12px] font-bold text-faint">
                  {job.step}/{job.totalSteps}
                </span>
              )}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-soft">
              <div
                className="h-full rounded-full bg-brand-gradient transition-all duration-500"
                style={{ width: `${Math.round((job.step / Math.max(1, job.totalSteps)) * 100)}%` }}
              />
            </div>
            {job.state === "error" && <p className="mt-2 text-[11px] font-medium leading-4 text-danger">{job.error}</p>}
          </div>
        )}

        {result && (
          <div className="space-y-2.5">
            <video src={result.videoUrl} controls playsInline className="w-full rounded-2xl border border-line bg-black" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium text-faint">
                {result.durationSec.toFixed(1)} 秒 · {result.segments} 段 · {result.resolution}
              </span>
              <a
                href={result.videoUrl}
                download={result.fileName}
                className="flex items-center gap-1.5 rounded-xl bg-soft px-3 py-2 text-[12px] font-bold text-ink"
              >
                <Download size={14} />
                保存
              </a>
            </div>

            {/* 免费档满意之后的下一步：同样的图和脚本直接跑付费的对口型版 */}
            {job?.kind === "local" && (
              <Button
                block
                variant="secondary"
                onClick={() => {
                  // 沿用同一批图：第一张当形象图，其余接着当开场后的画面
                  setMode("avatar");
                  void startGeneration("avatar");
                }}
              >
                就用这版，生成开场出镜版（约 ¥{avatarEstimate.yuan}）
              </Button>
            )}
          </div>
        )}

        {pollingError && jobId && (
          <div className="space-y-2 rounded-2xl border border-line bg-surface p-3.5">
            <p className="text-sm text-muted">查询已暂停，生成任务仍保留：{pollingError}</p>
            <Button variant="secondary" onClick={() => {
              setPollingError(null);
              setPollRevision((current) => current + 1);
            }}>继续查询</Button>
            <p className="text-xs text-faint">如果任务已丢失，可以停止跟踪。此操作不会取消后台任务，重新生成可能产生重复费用。</p>
            <Button variant="secondary" onClick={stopTracking}>停止跟踪此任务</Button>
          </div>
        )}

        <Button
          block
          size="lg"
          variant="ai"
          onClick={() => startGeneration(mode)}
          disabled={running}
          loading={running && !pollingError}
          icon={<Sparkles size={15} strokeWidth={2.4} />}
        >
          {pollingError && jobId
            ? "查询已暂停"
            : running
            ? "生成中，请留在本页"
            : result
              ? "再生成一条"
              : mode === "local"
                ? "免费生成预览"
                : "生成视频"}
        </Button>
      </div>
    </section>
  );
}
