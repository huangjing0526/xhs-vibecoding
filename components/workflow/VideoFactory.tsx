"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clapperboard,
  Copy,
  Film,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardHeader } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { Field, Input, Textarea } from "@/components/ui/Field";
import ModalOverlay from "@/components/ui/ModalOverlay";
import PipelineRail from "@/components/ui/PipelineRail";
import CastBoard from "@/components/workflow/CastBoard";
import RhythmBoard from "@/components/workflow/RhythmBoard";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import {
  analyzeStoryboard,
  attachShotClip,
  bindProjectCast,
  clearProjectCast,
  deleteBenchmarkRhythm,
  deleteVideoProject,
  detectBenchmarkRhythm,
  generateShotClip,
  generateShotFrame,
  getVideoGenProviders,
  listBenchmarkRhythms,
  listFrameCandidates,
  listVideoProjects,
  rewriteVideoScript,
  saveVideoProject,
  screenReplicability,
} from "@/lib/workflowClient";
import {
  CAMERA_MOVES,
  DEFAULT_TARGET_DURATION_SEC,
  EMPTY_CAST,
  SHOT_DURATIONS,
  SHOT_RESOLUTIONS,
  VIDEO_FACTORY_STEPS,
  applyCameraMove,
  checkScriptDuration,
  estimateDurationSec,
  secondsToChars,
  rhythmShotCount,
  storyboardDurationSec,
  type BenchmarkRhythm,
  type BenchmarkSkeleton,
  type CameraMove,
  type CastSlot,
  type ScriptDraft,
  type Shot,
  type ShotDuration,
  type ShotResolution,
  type VideoFactoryStepId,
  type VideoGenProviderId,
  type VideoGenProviderStatus,
  type VideoProject,
} from "@/lib/videoFactory";
import type { Notice } from "./types";

interface VideoFactoryProps {
  onNotice: (notice: Notice) => void;
  /** 从「链接拆片」送过来的结构骨架；消费后由父级清空，避免切回来又灌一次。 */
  incomingSkeleton: BenchmarkSkeleton | null;
  onSkeletonConsumed: () => void;
}

interface FrameCandidate {
  path: string;
  label: string;
  createdAt: string;
}

const EMPTY_PROJECT: VideoProject = {
  id: "",
  title: "",
  createdAt: "",
  updatedAt: "",
  skeleton: null,
  topic: { topic: "", product: "", sellingPoints: "", audience: "" },
  targetDurationSec: DEFAULT_TARGET_DURATION_SEC,
  rhythm: null,
  cast: EMPTY_CAST,
  script: null,
  storyboard: null,
  clips: [],
};

const DURATION_OPTIONS = [
  { value: "30", label: "30 秒" },
  { value: "45", label: "45 秒" },
  { value: "60", label: "60 秒" },
  { value: "90", label: "90 秒" },
];

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{children}</div>
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-bold text-muted">{children}</div>
);

/**
 * 运镜选择条。
 * 模型偏爱「静止」，光靠 prompt 压不住，给人一排能直接点的运镜——
 * 点完连运动提示词的开头一起改掉，不用手打。
 */
function CameraMovePicker({
  value,
  onPick,
}: {
  value: string;
  onPick: (move: CameraMove) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {CAMERA_MOVES.map((move) => (
        <button
          key={move.id}
          type="button"
          title={move.use}
          onClick={() => onPick(move)}
          aria-pressed={value === move.label}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-colors ${
            value === move.label ? "bg-ink text-white" : "bg-soft text-muted hover:bg-sunken hover:text-ink"
          }`}
        >
          {move.label}
        </button>
      ))}
    </div>
  );
}

/** 复制按钮：提示词要拿去别的平台粘贴，这是这一页最高频的动作。 */
function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error("[VideoFactory] 复制失败", { action: "videoFactory.copy", error });
    }
  };
  return (
    <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!text.trim()} icon={copied ? <Check size={13} /> : <Copy size={13} />}>
      {copied ? "已复制" : label}
    </Button>
  );
}

function ProviderButton({
  provider,
  selected,
  onSelect,
}: {
  provider: VideoGenProviderStatus;
  selected: boolean;
  onSelect: (id: VideoGenProviderId) => void;
}) {
  const enabled = provider.available && provider.authenticated;
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={() => onSelect(provider.id)}
      aria-pressed={selected}
      className={`rounded-2xl border p-3 text-left transition-all ${
        selected ? "border-brand-400 bg-brand-50 ring-2 ring-brand-100" : "border-line bg-surface"
      } ${enabled ? "hover:border-brand-300" : "cursor-not-allowed opacity-55"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink">{provider.name}</span>
        {enabled && <Check size={14} className="text-ok" />}
      </div>
      <p className="mt-1 text-[11px] leading-4 text-faint">{provider.message}</p>
    </button>
  );
}

/** 从图片工厂的产物里挑一张当首帧。 */
function FramePicker({
  frames,
  loading,
  onPick,
  onClose,
}: {
  frames: FrameCandidate[];
  loading: boolean;
  onPick: (frame: FrameCandidate) => void;
  onClose: () => void;
}) {
  return (
    <ModalOverlay onClose={onClose} maxWidthClass="max-w-3xl" ariaLabel="选择首帧图">
      <Card>
        <CardHeader
          title="从图片工厂选一张首帧"
          description="列的是 .local/image-factory 里最近的产物，最新的在前"
          action={<Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>}
        />
        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl bg-soft p-6 text-xs text-faint">
            <Loader2 size={14} className="animate-spin" />
            正在读图片工厂的产物
          </div>
        ) : frames.length === 0 ? (
          <EmptyState
            bare
            icon={<ImagePlus size={22} />}
            title="图片工厂里还没有产物"
            description="先去图片工厂按这一镜的首帧提示词生成一张 9:16 的图，再回来挑。"
          />
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-auto sm:grid-cols-4">
            {frames.map((frame) => (
              <button
                key={frame.path}
                type="button"
                onClick={() => onPick(frame)}
                className="overflow-hidden rounded-2xl border border-line bg-soft text-left transition-all hover:border-brand-300"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/video-factory/frames/image?path=${encodeURIComponent(frame.path)}`}
                  alt={frame.label}
                  className="aspect-square w-full object-cover"
                />
                <span className="block truncate px-2 py-1.5 text-[10px] font-semibold text-faint">{frame.label}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </ModalOverlay>
  );
}

export default function VideoFactory({ onNotice, incomingSkeleton, onSkeletonConsumed }: VideoFactoryProps) {
  const [project, setProject] = useState<VideoProject>(EMPTY_PROJECT);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [step, setStep] = useState<VideoFactoryStepId>("source");
  const [visualStyle, setVisualStyle] = useState("");

  /** 刚拆出来、还没套用的节奏；套用后以 project.rhythm 为准 */
  const [detectedRhythm, setDetectedRhythm] = useState<BenchmarkRhythm | null>(null);
  const [isDetectingRhythm, setIsDetectingRhythm] = useState(false);
  const [savedRhythms, setSavedRhythms] = useState<BenchmarkRhythm[]>([]);
  const [isScreening, setIsScreening] = useState(false);

  const [isWritingScript, setIsWritingScript] = useState(false);
  const [isCuttingShots, setIsCuttingShots] = useState(false);

  const [providers, setProviders] = useState<VideoGenProviderStatus[]>([]);
  const [provider, setProvider] = useState<VideoGenProviderId>("grok-cli");
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [resolution, setResolution] = useState<ShotResolution>("480p");

  const [frames, setFrames] = useState<FrameCandidate[]>([]);
  const [isLoadingFrames, setIsLoadingFrames] = useState(false);
  const [pickingShot, setPickingShot] = useState<number | null>(null);
  const [pendingFrames, setPendingFrames] = useState<Record<number, { path?: string; file?: File; label: string }>>({});
  const [generatingShot, setGeneratingShot] = useState<number | null>(null);
  const [castBusySlot, setCastBusySlot] = useState<CastSlot | null>(null);
  /** 生成首帧用的生图 CLI，和出片引擎是两码事，各选各的 */
  const [frameProvider, setFrameProvider] = useState<"codex" | "grok">("codex");
  const [framingShot, setFramingShot] = useState<number | null>(null);
  /** 重新生成首帧会覆盖同名文件，缩略图要绕开缓存 */
  const [frameVersion, setFrameVersion] = useState<Record<number, number>>({});
  /** 成片预览要绕开浏览器缓存：同一镜重跑会覆盖同名文件 */
  const [clipVersion, setClipVersion] = useState<Record<number, number>>({});

  const savedRef = useRef("");
  /** 存盘串成一条链：整份覆盖的接口不能并发，但也不能因为「正在存」就把新编辑丢掉。 */
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const script = project.script;
  const storyboard = project.storyboard;

  // 拆片页送过来的结构骨架：直接开一个新项目接住，不覆盖手上正在做的那条
  useEffect(() => {
    if (!incomingSkeleton) return;
    setProject({
      ...EMPTY_PROJECT,
      title: incomingSkeleton.title ? `对标《${incomingSkeleton.title}》` : "未命名视频",
      skeleton: incomingSkeleton,
    });
    setDetectedRhythm(null);
    setStep("source");
    savedRef.current = "";
    onSkeletonConsumed();
    onNotice({ type: "success", message: "结构骨架已送进视频工厂，填一下你自己的选题" });
  }, [incomingSkeleton, onSkeletonConsumed, onNotice]);

  const refreshProviders = useCallback(async () => {
    setIsLoadingProviders(true);
    try {
      const data = await getVideoGenProviders();
      setProviders(data.providers);
      const usable = data.providers.find((item) => item.available && item.authenticated);
      if (usable) setProvider(usable.id);
    } catch (error) {
      console.error("[VideoFactory] 引擎状态检查失败", { action: "videoFactory.providers", error });
    } finally {
      setIsLoadingProviders(false);
    }
  }, []);

  const refreshRhythms = useCallback(async () => {
    try {
      const data = await listBenchmarkRhythms();
      setSavedRhythms(data.rhythms);
    } catch (error) {
      console.error("[VideoFactory] 节奏模板读取失败", { action: "videoFactory.benchmark.list", error });
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const data = await listVideoProjects();
      setProjects(data.projects);
    } catch (error) {
      console.error("[VideoFactory] 项目列表读取失败", { action: "videoFactory.projects", error });
    }
  }, []);

  useEffect(() => {
    refreshProviders();
    refreshProjects();
    refreshRhythms();
  }, [refreshProviders, refreshProjects, refreshRhythms]);

  /** 存盘：整份覆盖。返回带 id 的项目，生成环节要靠这个 id 定产物目录。 */
  const persist = useCallback(
    async (next: VideoProject, options?: { resetClips?: boolean }): Promise<VideoProject> => {
      const { project: saved } = await saveVideoProject(next, options);
      savedRef.current = JSON.stringify({ ...saved, updatedAt: "" });
      setProject((current) => ({
        ...current,
        id: current.id || saved.id,
        createdAt: current.id ? current.createdAt : saved.createdAt,
        // clips 归服务端所有，存盘时不上送，这里再把盘上那份接回来——
        // 否则扩展推进来的片子在页面上永远不出现，得手动重选项目才看得到
        clips: saved.clips,
      }));
      return saved;
    },
    [],
  );

  // 自动存盘：脚本、分镜、每一处编辑都算数据，刷新不该丢
  useEffect(() => {
    if (!project.script && !project.skeleton && !project.topic.topic.trim()) return;
    const payload = JSON.stringify({ ...project, updatedAt: "" });
    if (payload === savedRef.current) return;

    const timer = setTimeout(() => {
      saveChainRef.current = saveChainRef.current
        .then(() => persist(project))
        .then(() => refreshProjects())
        .catch((error) => {
          console.error("[VideoFactory] 自动保存失败", { action: "videoFactory.autosave", projectId: project.id, error });
        });
    }, 900);
    return () => clearTimeout(timer);
  }, [project, persist, refreshProjects]);

  const patchTopic = (key: keyof VideoProject["topic"], value: string) => {
    setProject((current) => ({ ...current, topic: { ...current.topic, [key]: value } }));
  };

  /** 改脚本的任意字段都要顺带重算时长，收在一处，避免三个输入框各抄一遍。 */
  const patchScript = (patch: Partial<Pick<ScriptDraft, "hook" | "cta" | "segments">>) => {
    setProject((current) => {
      if (!current.script) return current;
      const next = { ...current.script, ...patch };
      return { ...current, script: { ...next, estimatedDurationSec: estimateDurationSec(next) } };
    });
  };

  const patchShot = (order: number, patch: Partial<Shot>) => {
    setProject((current) => {
      if (!current.storyboard) return current;
      return {
        ...current,
        storyboard: {
          ...current.storyboard,
          shots: current.storyboard.shots.map((shot) => (shot.order === order ? { ...shot, ...patch } : shot)),
        },
      };
    });
  };

  const handleDetectRhythm = async ({
    file,
    threshold,
    reuseId,
  }: {
    file?: File;
    threshold: number;
    reuseId?: string;
  }) => {
    setIsDetectingRhythm(true);
    try {
      const formData = new FormData();
      formData.append("threshold", String(threshold));
      if (reuseId) formData.append("id", reuseId);
      if (file) formData.append("videoFile", file);
      else if (project.skeleton?.videoUrl) formData.append("videoUrl", project.skeleton.videoUrl);
      formData.append(
        "sourceLabel",
        file?.name || (project.skeleton ? `@${project.skeleton.author}《${project.skeleton.title}》` : "对标视频"),
      );

      const data = await detectBenchmarkRhythm(formData);
      setDetectedRhythm(data.rhythm);
      // 重测灵敏度时项目里那份也要跟着换，不然套用的还是旧节奏
      setProject((current) =>
        current.rhythm?.id === data.rhythm.id ? { ...current, rhythm: data.rhythm } : current,
      );
      refreshRhythms();
      onNotice({ type: "success", message: `切出 ${data.rhythm.shots.length} 个镜头` });
    } catch (error) {
      console.error("[VideoFactory] 节奏拆解失败", { action: "videoFactory.benchmark", error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "节奏拆解失败" });
    } finally {
      setIsDetectingRhythm(false);
    }
  };

  /** 绑定角色或产品。项目还没落盘就先存一次——参考图要拷进项目目录，得先有 id。 */
  const handleBindCast = async (slot: CastSlot, source: { assetId?: string; label: string; file?: File }) => {
    setCastBusySlot(slot);
    try {
      const saved = project.id ? project : await persist(project);
      const formData = new FormData();
      formData.append("projectId", saved.id);
      formData.append("slot", slot);
      formData.append("label", source.label);
      if (source.file) formData.append("file", source.file);
      else if (source.assetId) formData.append("assetId", source.assetId);

      const data = await bindProjectCast(formData);
      setProject((current) => ({ ...current, id: saved.id, cast: { ...current.cast, [slot]: data.cast } }));
      onNotice({ type: "success", message: `已绑定${slot === "role" ? "角色" : "产品"}` });
    } catch (error) {
      console.error("[VideoFactory] 绑定参考图失败", { action: "videoFactory.cast.bind", slot, error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "绑定参考图失败" });
    } finally {
      setCastBusySlot(null);
    }
  };

  const handleClearCast = async (slot: CastSlot) => {
    if (!project.id) return;
    setCastBusySlot(slot);
    try {
      await clearProjectCast(project.id, slot);
      setProject((current) => ({ ...current, cast: { ...current.cast, [slot]: null } }));
    } catch (error) {
      console.error("[VideoFactory] 取消绑定失败", { action: "videoFactory.cast.clear", slot, error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "取消绑定失败" });
    } finally {
      setCastBusySlot(null);
    }
  };

  /** 按分镜提示词生成一镜首帧，自动带上绑定的角色与产品。返回是否成功，批量时据此中断。 */
  const runFrame = async (shot: Shot): Promise<boolean> => {
    if (!shot.framePrompt.trim()) {
      onNotice({ type: "error", message: `第 ${shot.order} 镜还没有首帧提示词` });
      return false;
    }
    setFramingShot(shot.order);
    try {
      const saved = project.id ? project : await persist(project);
      const formData = new FormData();
      formData.append("projectId", saved.id);
      formData.append("shotOrder", String(shot.order));
      formData.append("framePrompt", shot.framePrompt);
      formData.append("continuityNote", storyboard?.continuityNote || "");
      formData.append("provider", frameProvider);
      formData.append("cast", JSON.stringify(project.cast));

      await generateShotFrame(formData);
      setProject((current) => ({ ...current, id: saved.id }));
      setFrameVersion((current) => ({ ...current, [shot.order]: (current[shot.order] || 0) + 1 }));
      // 刚生成的首帧已经落在项目目录，出片时不用再选图
      setPendingFrames((current) => {
        const next = { ...current };
        delete next[shot.order];
        return next;
      });
      return true;
    } catch (error) {
      console.error("[VideoFactory] 首帧生成失败", { action: "videoFactory.frame", shotOrder: shot.order, error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "首帧生成失败" });
      return false;
    } finally {
      setFramingShot(null);
    }
  };

  const handleGenerateFrame = async (shot: Shot) => {
    if (await runFrame(shot)) onNotice({ type: "success", message: `第 ${shot.order} 镜首帧已生成` });
  };

  /** 批量出首帧：一张一分多钟，跑到哪算哪，中途失败就停下，别让人干等一串错。 */
  const handleGenerateAllFrames = async () => {
    if (!storyboard) return;
    const pending = storyboard.shots.filter((shot) => shot.framePrompt.trim());
    onNotice({ type: "info", message: `开始生成 ${pending.length} 张首帧，每张约 1~2 分钟` });
    let done = 0;
    for (const shot of pending) {
      if (!(await runFrame(shot))) break;
      done += 1;
    }
    onNotice({
      type: done === pending.length ? "success" : "info",
      message: done === pending.length ? `${done} 张首帧全部生成` : `已生成 ${done} 张，剩下的可以单独重试`,
    });
  };

  const handleScreenRhythm = async () => {
    const target = detectedRhythm || project.rhythm;
    if (!target) return;
    setIsScreening(true);
    onNotice({ type: "info", message: "正在看关键帧，约半分钟" });
    try {
      const data = await screenReplicability(target.id);
      setDetectedRhythm(data.rhythm);
      // 项目里套用的是同一份就一并更新，否则报告只存在于模板里、项目侧看不到
      setProject((current) =>
        current.rhythm?.id === data.rhythm.id ? { ...current, rhythm: data.rhythm } : current,
      );
      refreshRhythms();
      onNotice({
        type: data.usedFallback ? "info" : "success",
        message: data.usedFallback ? "未配置 AI，看不了画面" : "可复刻性结论已出",
      });
    } catch (error) {
      console.error("[VideoFactory] 可复刻性筛查失败", { action: "videoFactory.replicability", error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "可复刻性筛查失败" });
    } finally {
      setIsScreening(false);
    }
  };

  const handleDeleteRhythm = async (rhythmId: string) => {
    try {
      await deleteBenchmarkRhythm(rhythmId);
      // 正在用的那条被删了就一并解除套用，别让分镜按一份已经不存在的节奏切
      if (project.rhythm?.id === rhythmId) setProject((current) => ({ ...current, rhythm: null }));
      if (detectedRhythm?.id === rhythmId) setDetectedRhythm(null);
      refreshRhythms();
      onNotice({ type: "success", message: "节奏模板已删除" });
    } catch (error) {
      console.error("[VideoFactory] 节奏模板删除失败", { action: "videoFactory.benchmark.delete", rhythmId, error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "节奏模板删除失败" });
    }
  };

  const handleWriteScript = async () => {
    setIsWritingScript(true);
    try {
      const data = await rewriteVideoScript({
        skeleton: project.skeleton,
        topic: project.topic,
        targetDurationSec: project.targetDurationSec,
      });
      setProject((current) => ({
        ...current,
        title: current.title || data.script.title,
        script: data.script,
        // 脚本换了，旧分镜和旧成片就对不上了，一并作废，免得拿着过期的镜头去生成
        storyboard: null,
        clips: [],
      }));
      setStep("script");
      onNotice({
        type: data.usedFallback ? "info" : "success",
        message: data.usedFallback ? "未配置 AI，已铺好结构空位，口播稿请手写" : "已按对标结构写出新脚本",
      });
    } catch (error) {
      console.error("[VideoFactory] 脚本改写失败", { action: "videoFactory.script", error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "脚本改写失败" });
    } finally {
      setIsWritingScript(false);
    }
  };

  const handleCutShots = async () => {
    if (!script) return;
    setIsCuttingShots(true);
    try {
      const data = await analyzeStoryboard({ script, visualStyle, rhythm: project.rhythm });
      // 新分镜作废了旧片子。clips 归服务端所有，自动存盘不带它，
      // 所以这里要显式存一次说清「清空」，否则旧 clips 会留在盘上对不上新镜头
      const next: VideoProject = { ...project, storyboard: data.storyboard, clips: [] };
      setProject(next);
      if (next.id) await persist(next, { resetClips: true });
      setStep("storyboard");
      onNotice({
        type: data.usedFallback ? "info" : "success",
        message: data.usedFallback
          ? "未配置 AI，已按脚本分段一段一镜，提示词请手动补"
          : `已拆成 ${data.storyboard.shots.length} 个镜头`,
      });
    } catch (error) {
      console.error("[VideoFactory] 分镜拆解失败", { action: "videoFactory.storyboard", error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "分镜拆解失败" });
    } finally {
      setIsCuttingShots(false);
    }
  };

  const openFramePicker = async (shotOrder: number) => {
    setPickingShot(shotOrder);
    setIsLoadingFrames(true);
    try {
      const data = await listFrameCandidates();
      setFrames(data.frames);
    } catch (error) {
      console.error("[VideoFactory] 首帧图列表读取失败", { action: "videoFactory.frames", error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "首帧图列表读取失败" });
    } finally {
      setIsLoadingFrames(false);
    }
  };

  const handleGenerateShot = async (shot: Shot) => {
    const pending = pendingFrames[shot.order];
    const existing = project.clips.find((clip) => clip.shotOrder === shot.order);
    const framePath = pending?.path || existing?.framePath || "";
    // 三种来源都没有时，服务端还会去认盘上已生成的首帧，所以这里只拦「一次都没出过图」的
    if (!pending?.file && !framePath && !frameVersion[shot.order]) {
      onNotice({ type: "error", message: `第 ${shot.order} 镜还没有首帧图，点「生成首帧」或从图片工厂选一张` });
      return;
    }

    setGeneratingShot(shot.order);
    onNotice({ type: "info", message: `第 ${shot.order} 镜生成中，一般 1~3 分钟` });
    try {
      // 生成要往项目目录里落产物，先确保项目已经有 id
      const saved = project.id ? project : await persist(project);

      const formData = new FormData();
      formData.append("projectId", saved.id);
      formData.append("shotOrder", String(shot.order));
      formData.append("videoPrompt", shot.videoPrompt);
      formData.append("durationSec", String(shot.durationSec));
      formData.append("resolution", resolution);
      if (pending?.file) formData.append("frameFile", pending.file);
      else if (framePath) formData.append("framePath", framePath);
      // 两者都没有时不传，交给服务端去认项目目录里已生成的那张

      const data = await generateShotClip(formData);
      setProject((current) => ({
        ...current,
        id: saved.id,
        clips: [...current.clips.filter((clip) => clip.shotOrder !== shot.order), data.clip].sort(
          (a, b) => a.shotOrder - b.shotOrder,
        ),
      }));
      setClipVersion((current) => ({ ...current, [shot.order]: (current[shot.order] || 0) + 1 }));
      onNotice({ type: "success", message: `第 ${shot.order} 镜已生成` });
    } catch (error) {
      console.error("[VideoFactory] 图生视频失败", { action: "videoFactory.generate", shotOrder: shot.order, error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "图生视频失败" });
    } finally {
      setGeneratingShot(null);
    }
  };

  const handleAttachClip = async (shot: Shot, file: File) => {
    try {
      const saved = project.id ? project : await persist(project);
      const formData = new FormData();
      formData.append("projectId", saved.id);
      formData.append("shotOrder", String(shot.order));
      formData.append("durationSec", String(shot.durationSec));
      formData.append("clipFile", file);

      const data = await attachShotClip(formData);
      setProject((current) => ({
        ...current,
        id: saved.id,
        clips: [...current.clips.filter((clip) => clip.shotOrder !== shot.order), data.clip].sort(
          (a, b) => a.shotOrder - b.shotOrder,
        ),
      }));
      setClipVersion((current) => ({ ...current, [shot.order]: (current[shot.order] || 0) + 1 }));
      onNotice({ type: "success", message: `第 ${shot.order} 镜已挂上` });
    } catch (error) {
      console.error("[VideoFactory] 成片上传失败", { action: "videoFactory.attach", shotOrder: shot.order, error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "成片上传失败" });
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await deleteVideoProject(projectId);
      if (projectId === project.id) {
        setProject(EMPTY_PROJECT);
        savedRef.current = "";
        setStep("source");
      }
      refreshProjects();
      onNotice({ type: "success", message: "项目已删除" });
    } catch (error) {
      console.error("[VideoFactory] 项目删除失败", { action: "videoFactory.delete", projectId, error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "项目删除失败" });
    }
  };

  /** 剪映拼片要的清单：镜号、时长、字幕、文件路径。 */
  const shotListText = useMemo(() => {
    if (!storyboard) return "";
    return storyboard.shots
      .map((shot) => {
        const clip = project.clips.find((item) => item.shotOrder === shot.order);
        return [
          `第 ${shot.order} 镜 · ${
            shot.trimToSec !== undefined && shot.trimToSec < shot.durationSec
              ? `生成 ${shot.durationSec} 秒，剪到 ${shot.trimToSec} 秒`
              : `${shot.durationSec} 秒`
          } · ${shot.shotSize || "未标景别"} · ${shot.cameraMove || "未标运镜"}`,
          `字幕：${shot.subtitle || shot.voiceover || "（无）"}`,
          `成片：${clip?.videoPath || "（未生成）"}`,
        ].join("\n");
      })
      .join("\n\n");
  }, [storyboard, project.clips]);

  const steps = VIDEO_FACTORY_STEPS.map((item) => ({
    id: item.id,
    label: item.label,
    done:
      item.id === "source"
        ? Boolean(project.skeleton || project.topic.topic.trim())
        : item.id === "script"
          ? Boolean(script)
          : item.id === "storyboard"
            ? Boolean(storyboard)
            : project.clips.length > 0 && project.clips.length === (storyboard?.shots.length || 0),
    onSelect: () => setStep(item.id),
  }));

  const plannedDuration = storyboard ? storyboardDurationSec(storyboard) : 0;
  const durationCheck = checkScriptDuration(script?.estimatedDurationSec || 0, project.targetDurationSec);
  // 刚拆出来的优先显示；没有就显示项目里已经套用的那份
  const shownRhythm = detectedRhythm || project.rhythm;
  const selectedProvider = providers.find((item) => item.id === provider);
  const providerReady = Boolean(selectedProvider?.available && selectedProvider.authenticated);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PipelineRail steps={steps} />
          <div className="flex items-center gap-2">
            {project.id && <Badge tone="neutral">已存盘</Badge>}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setProject(EMPTY_PROJECT);
                setDetectedRhythm(null);
                savedRef.current = "";
                setStep("source");
              }}
            >
              新建一条
            </Button>
          </div>
        </div>
      </Card>

      {step === "source" && (
        <>
          {project.skeleton ? (
            <Card>
              <CardHeader
                title="对标结构骨架"
                description={`来自 ${project.skeleton.platform} @${project.skeleton.author || "未知作者"}`}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>钩子的设计思路</FieldLabel>
                  <p className="mt-1 text-sm leading-6 text-ink">{project.skeleton.hook || "（未拆出）"}</p>
                </div>
                <div>
                  <FieldLabel>戳中的痛点</FieldLabel>
                  <p className="mt-1 text-sm leading-6 text-ink">{project.skeleton.painPoint || "（未拆出）"}</p>
                </div>
              </div>
              {project.skeleton.stages.length > 0 && (
                <ol className="mt-3 space-y-1.5">
                  {project.skeleton.stages.map((stage, index) => (
                    <li key={`${stage.stage}-${index}`} className="rounded-xl bg-soft px-3 py-2 text-sm">
                      <span className="font-bold text-brand-600">{stage.stage || `第 ${index + 1} 段`}</span>
                      {stage.purpose && <span className="ml-2 text-muted">{stage.purpose}</span>}
                    </li>
                  ))}
                </ol>
              )}
              <Callout tone="warn" className="mt-3">
                只借结构，不借画面和原句。案例、数据、场景都要换成你自己的。
              </Callout>
            </Card>
          ) : (
            <Callout tone="info">
              没有对标来源也能做：直接填下面的选题，从零写一条。想借结构的话，去「链接拆片」拆一条再送过来。
            </Callout>
          )}

          <RhythmBoard
            rhythm={shownRhythm}
            busy={isDetectingRhythm}
            sourceUrl={project.skeleton?.videoUrl}
            saved={savedRhythms}
            onPickSaved={(item) => setDetectedRhythm(item)}
            onDeleteSaved={handleDeleteRhythm}
            onReset={() => {
              setDetectedRhythm(null);
              setProject((current) => ({ ...current, rhythm: null }));
            }}
            onDetect={handleDetectRhythm}
            applied={Boolean(shownRhythm && project.rhythm?.id === shownRhythm.id)}
            onApply={() => {
              if (!shownRhythm) return;
              setProject((current) => ({ ...current, rhythm: shownRhythm }));
              onNotice({ type: "success", message: "已套用这条节奏，拆分镜时会照它切" });
            }}
            onClear={() => setProject((current) => ({ ...current, rhythm: null }))}
            onScreen={handleScreenRhythm}
            screening={isScreening}
          />

          <CastBoard
            projectId={project.id}
            cast={project.cast}
            busySlot={castBusySlot}
            onPickAsset={(slot, asset) => handleBindCast(slot, { assetId: asset.id, label: asset.name })}
            onUpload={(slot, file) => handleBindCast(slot, { label: file.name.replace(/\.[^.]+$/, ""), file })}
            onClear={handleClearCast}
          />

          <Card>
            <CardHeader title="这条视频讲什么" description="这里填的东西会全部进脚本，缺的地方模型不会替你编" />
            <div className="grid gap-4">
              <Field label="主题" hint="一句话说清这条视频要讲的事">
                <Input
                  value={project.topic.topic}
                  onChange={(event) => patchTopic("topic", event.target.value)}
                  placeholder="例：夏天出汗也不脱妆的底妆手法"
                />
              </Field>
              <Field label="产品 / 服务" hint="没有就留空，留空时脚本不会带货">
                <Input
                  value={project.topic.product}
                  onChange={(event) => patchTopic("product", event.target.value)}
                  placeholder="例：XX 控油散粉"
                />
              </Field>
              <Field label="卖点 / 核心观点" hint="一行一条。这是模型唯一能用的事实来源">
                <Textarea
                  rows={4}
                  value={project.topic.sellingPoints}
                  onChange={(event) => patchTopic("sellingPoints", event.target.value)}
                  placeholder={"例：\n上妆后 8 小时不氧化\n实测 35 度户外\n不卡纹，敏感肌可用"}
                />
              </Field>
              <Field label="目标观众">
                <Input
                  value={project.topic.audience}
                  onChange={(event) => patchTopic("audience", event.target.value)}
                  placeholder="例：20-30 岁油皮女生"
                />
              </Field>
              <Field label="目标时长" hint="口播按每秒 4.5 字估算，决定后面切几个镜头">
                <SegmentedControl
                  ariaLabel="目标时长"
                  value={String(project.targetDurationSec)}
                  options={DURATION_OPTIONS}
                  onChange={(value) =>
                    setProject((current) => ({ ...current, targetDurationSec: Number(value) }))
                  }
                  compact
                />
              </Field>
            </div>
            <div className="mt-4">
              <Button
                variant="ai"
                onClick={handleWriteScript}
                loading={isWritingScript}
                disabled={!project.topic.topic.trim() && !project.topic.sellingPoints.trim()}
                icon={<Wand2 size={14} />}
              >
                {isWritingScript ? "写稿中" : "写脚本"}
              </Button>
            </div>
          </Card>

          {projects.length > 0 && (
            <Card>
              <CardHeader title="最近的项目" description="点一条接着做，四步进度都在里面" />
              <div className="space-y-2">
                {projects.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${
                      item.id === project.id ? "border-brand-300 bg-brand-50" : "border-line bg-surface"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setProject(item);
                        setDetectedRhythm(null);
                        savedRef.current = JSON.stringify({ ...item, updatedAt: "" });
                        setStep(item.storyboard ? "storyboard" : item.script ? "script" : "source");
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-bold text-ink">{item.title}</span>
                      <span className="mt-0.5 block text-[11px] text-faint">
                        {item.storyboard ? `${item.storyboard.shots.length} 镜` : item.script ? "已出脚本" : "只有选题"}
                        {item.clips.length > 0 && ` · 已生成 ${item.clips.length} 镜`}
                      </span>
                    </button>
                    <Button size="sm" variant="danger" onClick={() => handleDeleteProject(item.id)} icon={<Trash2 size={13} />}>
                      删除
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {step === "script" && (
        script ? (
          <>
            <Card>
              <CardHeader
                title={script.title}
                description={`估算时长 ${script.estimatedDurationSec} 秒 · 目标 ${project.targetDurationSec} 秒`}
                action={
                  <div className="flex gap-2">
                    <CopyButton
                      label="复制全稿"
                      text={[script.hook, ...script.segments.map((s) => s.voiceover), script.cta]
                        .filter(Boolean)
                        .join("\n\n")}
                    />
                    <Button size="sm" variant="secondary" onClick={handleWriteScript} loading={isWritingScript}>
                      重写一版
                    </Button>
                  </div>
                }
              />
              {durationCheck.status !== "ok" && (
                <Callout tone={durationCheck.status === "over" ? "warn" : "info"} className="mb-3">
                  {durationCheck.status === "over"
                    ? `比目标长了 ${durationCheck.deltaSec} 秒，大约要删 ${secondsToChars(durationCheck.deltaSec)} 字。不删的话分镜会多切出好几个镜头，每镜都是一次生成。`
                    : `比目标短了 ${-durationCheck.deltaSec} 秒，大约还能加 ${secondsToChars(durationCheck.deltaSec)} 字，够补一个案例或一句细节。`}
                </Callout>
              )}

              {script.borrowedStructure && (
                <Callout tone="info" className="mb-4">
                  {script.borrowedStructure}
                </Callout>
              )}

              <div className="space-y-3">
                <div>
                  <FieldLabel>开头钩子</FieldLabel>
                  <Textarea
                    rows={2}
                    className="mt-1"
                    value={script.hook}
                    onChange={(event) => patchScript({ hook: event.target.value })}
                  />
                </div>

                {script.segments.map((segment, index) => (
                  <div key={`${segment.stage}-${index}`} className="rounded-2xl border border-line bg-soft p-3.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-brand-600">{segment.stage || `第 ${index + 1} 段`}</span>
                      {segment.purpose && <span className="text-xs text-muted">{segment.purpose}</span>}
                    </div>
                    <Textarea
                      rows={3}
                      className="mt-2"
                      value={segment.voiceover}
                      onChange={(event) =>
                        patchScript({
                          segments: script.segments.map((item, i) =>
                            i === index ? { ...item, voiceover: event.target.value } : item,
                          ),
                        })
                      }
                    />
                  </div>
                ))}

                <div>
                  <FieldLabel>行动号召</FieldLabel>
                  <Textarea
                    rows={2}
                    className="mt-1"
                    value={script.cta}
                    onChange={(event) => patchScript({ cta: event.target.value })}
                  />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="拆分镜"
                description={
                  project.rhythm
                    ? `照对标「${project.rhythm.sourceLabel}」的节奏切，${rhythmShotCount(project.rhythm)} 段，时长一秒不改`
                    : "每镜只能是 6 秒或 10 秒——这是图生视频模型的硬约束"
                }
                action={
                  project.rhythm ? (
                    <Badge tone="brand">套了对标节奏</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setStep("source")}>
                      去拆个节奏
                    </Button>
                  )
                }
              />
              <Field label="画面风格" hint="选填。留空则由模型定一个统一风格并写进一致性说明">
                <Input
                  value={visualStyle}
                  onChange={(event) => setVisualStyle(event.target.value)}
                  placeholder="例：日系清透、自然光、冷调；或 赛博霓虹、强对比"
                />
              </Field>
              <div className="mt-4">
                <Button variant="ai" onClick={handleCutShots} loading={isCuttingShots} icon={<Clapperboard size={14} />}>
                  {isCuttingShots ? "拆解中" : "拆成分镜表"}
                </Button>
              </div>
            </Card>
          </>
        ) : (
          <EmptyState
            icon={<Wand2 size={22} />}
            title="还没有脚本"
            description="回上一步填好选题，点「写脚本」。"
            action={<Button variant="primary" onClick={() => setStep("source")}>回去填选题</Button>}
          />
        )
      )}

      {step === "storyboard" && (
        storyboard ? (
          <>
            <Card>
              <CardHeader
                title={`分镜表 · ${storyboard.shots.length} 镜`}
                description={
                  project.rhythm
                    ? `成片 ${plannedDuration} 秒，对标 ${project.rhythm.totalDurationSec} 秒`
                    : `总时长 ${plannedDuration} 秒，脚本估算 ${script?.estimatedDurationSec || 0} 秒`
                }
                action={
                  <Button size="sm" variant="secondary" onClick={handleCutShots} loading={isCuttingShots}>
                    重拆
                  </Button>
                }
              />
              {storyboard.continuityNote && <Callout tone="info">{storyboard.continuityNote}</Callout>}
              {script && !project.rhythm && Math.abs(plannedDuration - script.estimatedDurationSec) > 12 && (
                <Callout tone="warn" className="mt-3">
                  分镜总时长和脚本估算差了 {Math.abs(plannedDuration - script.estimatedDurationSec)} 秒，
                  要么改镜头时长，要么回去删几句口播。
                </Callout>
              )}
            </Card>

            {storyboard.shots.map((shot) => (
              <Card key={shot.order}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">第 {shot.order} 镜</Badge>
                  <SegmentedControl
                    ariaLabel={`第 ${shot.order} 镜时长`}
                    compact
                    value={String(shot.durationSec)}
                    options={SHOT_DURATIONS.map((value) => ({ value: String(value), label: `${value} 秒` }))}
                    onChange={(value) => patchShot(shot.order, { durationSec: Number(value) as ShotDuration })}
                  />
                  {shot.trimToSec !== undefined && shot.trimToSec < shot.durationSec && (
                    <Badge tone="warn">剪到 {shot.trimToSec} 秒</Badge>
                  )}
                  {shot.shotSize && <span className="text-xs text-faint">{shot.shotSize}</span>}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-faint">运镜</span>
                  <CameraMovePicker
                    value={shot.cameraMove}
                    onPick={(move) =>
                      patchShot(shot.order, {
                        cameraMove: move.label,
                        videoPrompt: applyCameraMove(shot.videoPrompt, move),
                      })
                    }
                  />
                  {!shot.cameraMove && <span className="text-[11px] text-warn">未定运镜</span>}
                </div>

                {shot.visual && <p className="mt-2.5 text-sm leading-6 text-ink">{shot.visual}</p>}

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between">
                      <FieldLabel>第一帧提示词</FieldLabel>
                      <CopyButton text={shot.framePrompt} />
                    </div>
                    <Textarea
                      rows={4}
                      className="mt-1"
                      value={shot.framePrompt}
                      onChange={(event) => patchShot(shot.order, { framePrompt: event.target.value })}
                      placeholder="拿去图片工厂生成 9:16 首帧图"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <FieldLabel>运动提示词</FieldLabel>
                      <CopyButton text={shot.videoPrompt} />
                    </div>
                    <Textarea
                      rows={4}
                      className="mt-1"
                      value={shot.videoPrompt}
                      onChange={(event) => patchShot(shot.order, { videoPrompt: event.target.value })}
                      placeholder="只写怎么动，画面内容交给首帧图"
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>口播</FieldLabel>
                    <Textarea
                      rows={2}
                      className="mt-1"
                      value={shot.voiceover}
                      onChange={(event) => patchShot(shot.order, { voiceover: event.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel>字幕</FieldLabel>
                    <Textarea
                      rows={2}
                      className="mt-1"
                      value={shot.subtitle}
                      onChange={(event) => patchShot(shot.order, { subtitle: event.target.value })}
                    />
                  </div>
                </div>
              </Card>
            ))}

            <Card>
              <Button variant="primary" onClick={() => setStep("generate")} icon={<Film size={14} />}>
                去生成视频
              </Button>
            </Card>
          </>
        ) : (
          <EmptyState
            icon={<Clapperboard size={22} />}
            title="还没有分镜表"
            description="回上一步，点「拆成分镜表」。"
            action={<Button variant="primary" onClick={() => setStep("script")}>回去拆分镜</Button>}
          />
        )
      )}

      {step === "generate" && (
        storyboard ? (
          <>
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-ink">生成引擎</h2>
                  <p className="mt-0.5 text-[11px] text-faint">每镜 6 或 10 秒，480p / 720p，比例跟首帧图走</p>
                </div>
                <button
                  type="button"
                  onClick={refreshProviders}
                  disabled={isLoadingProviders}
                  className="rounded-xl p-2 text-faint hover:bg-soft hover:text-ink"
                  aria-label="刷新引擎状态"
                >
                  <RefreshCw size={15} className={isLoadingProviders ? "animate-spin" : ""} />
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {providers.map((item) => (
                  <ProviderButton key={item.id} provider={item} selected={provider === item.id} onSelect={setProvider} />
                ))}
              </div>
              {provider === "grok-cli" && (
                <div className="mt-3">
                  <Field label="分辨率">
                    <SegmentedControl
                      ariaLabel="分辨率"
                      compact
                      value={resolution}
                      options={SHOT_RESOLUTIONS.map((value) => ({ value, label: value }))}
                      onChange={(value) => setResolution(value as ShotResolution)}
                    />
                  </Field>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader
                title="首帧图"
                description={
                  project.cast.role || project.cast.product
                    ? `按每镜提示词生成，自动带上${[project.cast.role && "角色", project.cast.product && "产品"].filter(Boolean).join("和")}参考图`
                    : "还没绑角色和产品——现在生成的话，每镜的人和货都会不一样"
                }
                action={
                  <Button
                    variant="ai"
                    size="sm"
                    onClick={handleGenerateAllFrames}
                    loading={framingShot !== null}
                    disabled={framingShot !== null || generatingShot !== null}
                    icon={<ImagePlus size={13} />}
                  >
                    {framingShot !== null ? `第 ${framingShot} 镜出图中` : `把 ${storyboard.shots.length} 镜首帧全生成`}
                  </Button>
                }
              />
              <div className="flex flex-wrap items-center gap-3">
                <Field label="生图 CLI">
                  <SegmentedControl
                    ariaLabel="生图 CLI"
                    compact
                    value={frameProvider}
                    options={[
                      { value: "codex", label: "Codex" },
                      { value: "grok", label: "Grok" },
                    ]}
                    onChange={(value) => setFrameProvider(value as "codex" | "grok")}
                  />
                </Field>
                {!project.cast.role && !project.cast.product && (
                  <Button size="sm" variant="ghost" onClick={() => setStep("source")}>
                    去绑角色和产品
                  </Button>
                )}
              </div>
            </Card>

            {storyboard.shots.map((shot) => {
              const clip = project.clips.find((item) => item.shotOrder === shot.order);
              const pending = pendingFrames[shot.order];
              const frameLabel = pending?.label || (clip?.framePath ? "已用上次的首帧" : "");
              const busy = generatingShot === shot.order;

              return (
                <Card key={shot.order}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">第 {shot.order} 镜</Badge>
                    <span className="text-xs text-faint">
                      生成 {shot.durationSec} 秒
                      {shot.trimToSec !== undefined && shot.trimToSec < shot.durationSec && ` · 剪到 ${shot.trimToSec} 秒`}
                    </span>
                    {clip && <Badge tone="ok">已出片</Badge>}
                  </div>

                  <p className="mt-2 text-sm leading-6 text-muted">{shot.visual || shot.voiceover || "（这一镜没写画面）"}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="ai"
                      onClick={() => handleGenerateFrame(shot)}
                      loading={framingShot === shot.order}
                      disabled={framingShot !== null || generatingShot !== null}
                      icon={<Sparkles size={13} />}
                    >
                      {framingShot === shot.order ? "出图中" : "生成首帧"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openFramePicker(shot.order)} icon={<ImagePlus size={13} />}>
                      从图片工厂选
                    </Button>
                    <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-xs font-bold text-ink transition-colors hover:border-brand-300 hover:bg-brand-50">
                      <Upload size={13} />
                      上传首帧
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            setPendingFrames((current) => ({ ...current, [shot.order]: { file, label: file.name } }));
                          }
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {frameLabel && <span className="truncate text-[11px] text-faint">{frameLabel}</span>}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {provider === "grok-cli" ? (
                      <Button
                        variant="ai"
                        size="sm"
                        onClick={() => handleGenerateShot(shot)}
                        loading={busy}
                        disabled={!providerReady || generatingShot !== null}
                        icon={<Film size={13} />}
                      >
                        {busy ? "生成中" : clip ? "重新生成" : "生成这一镜"}
                      </Button>
                    ) : (
                      <>
                        <CopyButton label="复制运动提示词" text={shot.videoPrompt} />
                        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-xs font-bold text-ink transition-colors hover:border-brand-300 hover:bg-brand-50">
                          <Upload size={13} />
                          回传 mp4
                          <input
                            type="file"
                            accept="video/mp4"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) handleAttachClip(shot, file);
                              event.target.value = "";
                            }}
                          />
                        </label>
                      </>
                    )}
                    {!providerReady && provider === "grok-cli" && (
                      <span className="text-[11px] font-semibold text-warn">{selectedProvider?.message}</span>
                    )}
                    {provider === "doubao" && (
                      // 豆包这条路的回传由扩展自动完成，旁边那个「回传 mp4」只是手动兜底
                      <span className="text-[11px] text-faint">
                        提示词贴进豆包出片后，用「豆包下载器」的『送到工作台』直接挂上，不用手动回传
                      </span>
                    )}
                  </div>

                  {(frameVersion[shot.order] || clip?.framePath) && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/video-factory/frame?projectId=${encodeURIComponent(project.id)}&shot=${shot.order}&v=${
                        frameVersion[shot.order] || 1
                      }`}
                      alt={`第 ${shot.order} 镜首帧`}
                      className="mt-3 h-40 w-[90px] rounded-xl border border-line bg-sunken object-cover"
                    />
                  )}

                  {clip && (
                    <video
                      controls
                      src={`/api/video-factory/clip?projectId=${encodeURIComponent(project.id)}&shot=${shot.order}&v=${
                        clipVersion[shot.order] || 1
                      }`}
                      className="mt-3 w-full max-w-[240px] rounded-2xl border border-line bg-black"
                    />
                  )}
                </Card>
              );
            })}

            <Card>
              <CardHeader
                title="拿去剪映拼片"
                description="镜号、时长、字幕、文件路径，复制出去就能对着剪"
                action={<CopyButton label="复制镜头清单" text={shotListText} />}
              />
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-soft p-4 text-xs leading-6 text-muted">
                {shotListText}
              </pre>
            </Card>
          </>
        ) : (
          <EmptyState
            icon={<Film size={22} />}
            title="还没有分镜表"
            description="生成是按镜头来的，先把分镜拆出来。"
            action={<Button variant="primary" onClick={() => setStep("script")}>回去拆分镜</Button>}
          />
        )
      )}

      {pickingShot !== null && (
        <FramePicker
          frames={frames}
          loading={isLoadingFrames}
          onClose={() => setPickingShot(null)}
          onPick={(frame) => {
            setPendingFrames((current) => ({ ...current, [pickingShot]: { path: frame.path, label: frame.label } }));
            setPickingShot(null);
          }}
        />
      )}
    </div>
  );
}
