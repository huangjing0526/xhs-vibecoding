/**
 * 生视频（本地合成 / 数字人口播 / 产品展示）的共享定义。
 *
 * 真正调云 API 的代码在 services/video-renderer 里（那边是长驻 Node 进程，有磁盘和 ffmpeg，
 * 还要串行编排分钟级任务），这里只放主 app 与它对话需要的类型、选项和费用估算。
 * 常量在两边各有一份——分属两个包、其中一个要能部署到 Cloudflare，没法共享模块。
 */

export type VideoGenMode = "local" | "avatar" | "product";
export type AvatarResolution = "480P" | "720P";
/** 图生视频的供应商。默认百炼 flash 档，比硅基流动便宜约四倍。 */
export type I2VProvider = "bailian" | "siliconflow";
export type VideoJobState = "running" | "done" | "error";

export interface VideoGenResult {
  fileName: string;
  videoUrl: string;
  durationSec: number;
  /** 生成用了几段（数字人按 20 秒切段，其余按图片张数） */
  segments: number;
  resolution: string;
}

export interface VideoGenJob {
  id: string;
  kind: VideoGenMode;
  state: VideoJobState;
  /** 一句话的当前进展，直接展示给用户 */
  stage: string;
  step: number;
  totalSteps: number;
  result: VideoGenResult | null;
  error: string | null;
}

export interface VoiceOption {
  id: string;
  label: string;
}

/** edge-tts 的中文音色，免费且无需录音。 */
export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "zh-CN-XiaoxiaoNeural", label: "晓晓 · 女声亲和" },
  { id: "zh-CN-YunxiNeural", label: "云希 · 男声年轻" },
  { id: "zh-CN-XiaoyiNeural", label: "晓伊 · 女声活泼" },
  { id: "zh-CN-YunjianNeural", label: "云健 · 男声沉稳" },
];

export const DEFAULT_VOICE = VOICE_OPTIONS[0].id;

/** 百炼 wan2.2-s2v 的计费单价（元/秒）。来源：百炼计费文档。 */
export const AVATAR_PRICE_PER_SEC: Record<AvatarResolution, number> = {
  "480P": 0.5,
  "720P": 0.9,
};

/** 图生视频单价。百炼 flash 按秒（一段固定 5 秒），硅基流动按次。 */
export const I2V_PRICE = {
  bailian: { perClip: 0.5, label: "百炼 flash · 0.1 元/秒" },
  siliconflow: { perClip: 2, label: "硅基流动 · 2 元/段" },
} satisfies Record<I2VProvider, { perClip: number; label: string }>;

/** 中文口播的经验语速（字/秒），与渲染服务 script.mjs 保持一致。 */
const CHARS_PER_SEC = 4.5;

/** 平台单次只吃 20 秒以内音频，超了会自动切段——用它算要跑几段、要等多久。 */
export const AVATAR_SEC_PER_SEGMENT = 19;

/**
 * 出镜方式。开场出镜是成本的主要杠杆：只有开场那几秒按秒计费，后面用图铺画面，
 * 一条 60 秒能从 ¥30 降到 ¥2.5，而且更像正经剪辑而不是「盯着一个人念一分钟」。
 */
export const OPENING_OPTIONS = [
  { sec: 5, label: "开场 5 秒" },
  { sec: 10, label: "开场 10 秒" },
  { sec: 15, label: "开场 15 秒" },
  { sec: 0, label: "全程出镜" },
] as const;

export const DEFAULT_OPENING_SEC = 5;

export interface AvatarEstimate {
  /** 整条成片的预估时长 */
  seconds: number;
  /** 真正按秒计费的时长：开场出镜时只算开场那几秒 */
  billedSeconds: number;
  segments: number;
  yuan: number;
  /** 单段 5-10 分钟且账号只能串行跑，等待时间要提前说清楚 */
  minutesLow: number;
  minutesHigh: number;
}

/** 按字数估算配音时长。真实时长以合成结果为准，UI 上要标明是预估。 */
export function estimateSeconds(script: string): number {
  return Math.max(1, Math.round(script.replace(/\s+/g, "").length / CHARS_PER_SEC));
}

export function estimateAvatar(
  script: string,
  resolution: AvatarResolution,
  openingSec: number = DEFAULT_OPENING_SEC
): AvatarEstimate {
  const seconds = estimateSeconds(script);

  // 开场出镜只跑一次生成、只按开场时长计费；全程出镜按整条算，还要切成多段串行跑
  const isOpening = openingSec > 0;
  const billedSeconds = isOpening ? Math.min(openingSec, seconds) : seconds;
  const segments = isOpening ? 1 : Math.max(1, Math.ceil(seconds / AVATAR_SEC_PER_SEGMENT));

  return {
    seconds,
    billedSeconds,
    segments,
    yuan: Number((billedSeconds * AVATAR_PRICE_PER_SEC[resolution]).toFixed(2)),
    minutesLow: segments * 5,
    minutesHigh: segments * 10,
  };
}

/** 产品展示按图片张数计费：一张图出一段画面。 */
export function estimateProduct(imageCount: number, provider: I2VProvider): number {
  return Number((Math.max(1, imageCount) * I2V_PRICE[provider].perClip).toFixed(2));
}
