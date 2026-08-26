/**
 * 视频工厂的数据契约：拆片 → 脚本改写 → 分镜表 → 图生视频，四步共用一个 VideoProject。
 *
 * 与 lib/videoWorkflow.ts 的 VideoPlan 是两条独立的线：那条是 Remotion 渲的「图文快闪」，
 * 这条是 AI 生成式视频（首帧图 + 图生视频模型）。两者的约束完全不同，不要合并。
 */

// 只取类型，运行时不成环：benchmark.ts 反过来要用这里的 SHOT_DURATIONS 常量
import type { BenchmarkRhythm } from "./benchmark";

/**
 * 生成引擎。照 SHOT_DURATIONS 的路子从常量数组派生类型，
 * 免得联合类型、运行时白名单、引擎卡片三处各写一份再悄悄漂移。
 */
export const VIDEO_GEN_PROVIDERS = ["grok-cli", "gemini-veo", "doubao", "manual"] as const;
export type VideoGenProviderId = (typeof VIDEO_GEN_PROVIDERS)[number];

/**
 * 走回传端点的通道：片子在别处生成好再传回来挂上，doubao 由扩展自动推、manual 由人选文件。
 * grok-cli 不在其中——它在本机出片、自己落盘，走的是 generate 路由。
 */
export const UPLOAD_PROVIDERS = ["doubao", "manual"] as const;
export type UploadProviderId = (typeof UPLOAD_PROVIDERS)[number];

export function isUploadProvider(value: unknown): value is UploadProviderId {
  return UPLOAD_PROVIDERS.includes(value as UploadProviderId);
}

/**
 * 所有引擎档位的并集，只用来收窄类型。
 * 「这个引擎实际支持哪几档」由下面的 PROVIDER_CAPS 说了算——
 * 各家档位对不上（grok 6/10、Veo 4/6/8），拿并集去校验等于没校验。
 */
export const SHOT_DURATIONS = [4, 6, 8, 10] as const;
export type ShotDuration = (typeof SHOT_DURATIONS)[number];

export const SHOT_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export type ShotResolution = (typeof SHOT_RESOLUTIONS)[number];

/** 出片比例。grok 的 image_to_video 没有这个参数（跟随首帧图），只有 Veo 认。 */
export const SHOT_ASPECT_RATIOS = ["16:9", "9:16"] as const;
export type ShotAspectRatio = (typeof SHOT_ASPECT_RATIOS)[number];

/** 一个生成引擎能接受的参数范围。 */
export interface VideoGenCapability {
  /** 可选时长档位；空数组表示这条通道不由我们发起生成（片子在别处做好再传回来） */
  durations: readonly ShotDuration[];
  resolutions: readonly ShotResolution[];
  /** 不支持指定比例的引擎为空数组——比例跟随首帧图 */
  aspectRatios: readonly ShotAspectRatio[];
}

/**
 * 各引擎的参数范围。
 *
 * 这张表决定分镜能切成几秒，所以引擎必须在拆分镜之前就定下来，
 * 而不是等到出片那一步才选——否则拆好的分镜换个引擎就有一半时长非法。
 */
export const PROVIDER_CAPS: Record<VideoGenProviderId, VideoGenCapability> = {
  // 实测：image_to_video 只有 6/10 秒两档，480p/720p，比例跟随首帧图
  "grok-cli": { durations: [6, 10], resolutions: ["480p", "720p"], aspectRatios: [] },
  // Veo 3.1：durationSeconds 只认 4/6/8；4k 档没验证过，先不放出来
  "gemini-veo": { durations: [4, 6, 8], resolutions: ["720p", "1080p"], aspectRatios: ["16:9", "9:16"] },
  // 回传通道：片子在别处生成，时长按传回来的文件实际长度记，不受档位约束
  doubao: { durations: [], resolutions: [], aspectRatios: [] },
  manual: { durations: [], resolutions: [], aspectRatios: [] },
};

/**
 * 由我们发起生成的引擎，与回传通道相对。
 * 直接取 UPLOAD_PROVIDERS 的补集，不另立一张表——两张表迟早会给出相反的答案，
 * 而信它们的两个调用方（界面画哪种按钮、clip 路由收不收文件）会各信一个。
 */
export function isGenerativeProvider(id: VideoGenProviderId): boolean {
  return !isUploadProvider(id);
}

/** 改写后脚本里的一段，与拆片拆出的 stage 一一对应。 */
export interface ScriptSegment {
  /** 阶段名，沿用对标结构的命名（钩子/痛点/干货/转折/行动号召） */
  stage: string;
  /** 这一段要达成什么 */
  purpose: string;
  /** 我自己的口播原文，不是对标视频的原句 */
  voiceover: string;
}

/** 用对标结构 + 自己的选题写出来的新脚本。 */
export interface ScriptDraft {
  title: string;
  /** 开头 3 秒的钩子 */
  hook: string;
  segments: ScriptSegment[];
  /** 结尾的行动号召 */
  cta: string;
  /** 按语速估的总时长，用来判断分镜要切几个 */
  estimatedDurationSec: number;
  /** 这一稿借了对标的什么结构、换掉了什么——合规留痕，UI 常驻展示 */
  borrowedStructure: string;
}

/** 分镜表里的一个镜头。 */
export interface Shot {
  /** 从 1 开始的镜号 */
  order: number;
  /** 生成时长，引擎只认 6 / 10 秒 */
  durationSec: ShotDuration;
  /**
   * 成片里这一镜实际用多长。
   * 套了对标节奏才有——爆款大量镜头短于 6 秒，只能生成 6 秒再剪短用。
   * 不填就等于整段都用。
   */
  trimToSec?: number;
  /** 景别：远景/全景/中景/近景/特写 */
  shotSize: string;
  /** 运镜：固定/推/拉/摇/跟/环绕 */
  cameraMove: string;
  /** 画面里发生什么 */
  visual: string;
  /** 这一镜配的口播原文（从 ScriptDraft 切下来） */
  voiceover: string;
  /** 压在画面上的字幕，通常比口播短 */
  subtitle: string;
  /** 喂给图片工厂的第一帧提示词 */
  framePrompt: string;
  /** 喂给图生视频模型的运动提示词，只描述「怎么动」，画面内容由首帧承载 */
  videoPrompt: string;
}

/** 分镜表。比例固定 9:16——六个发布目标里五个是竖视频。 */
export interface Storyboard {
  shots: Shot[];
  /** 跨镜头怎么保持人物/场景一致，写给操作的人看 */
  continuityNote: string;
}

/** 一个镜头生成出来的片段。 */
export interface ShotClip {
  shotOrder: number;
  provider: VideoGenProviderId;
  /** 落在项目目录里的绝对路径 */
  videoPath: string;
  durationSec: number;
  /** 手动回传的片子我们量不出分辨率，这时留空而不是硬填一个 */
  resolution?: ShotResolution;
  createdAt: string;
  /** 生成这一镜用的首帧图绝对路径，便于重跑时复用 */
  framePath: string;
}

/** 拆片带过来的结构骨架：只有结构，没有原视频的画面与原句。 */
export interface BenchmarkSkeleton {
  platform: string;
  author: string;
  title: string;
  /** 本机拆片服务上的无水印视频地址，拆节奏时直接用它，省掉一次下载再上传 */
  videoUrl: string;
  hook: string;
  stages: Array<{ stage: string; purpose: string }>;
  style: string;
  painPoint: string;
  reusableTemplate: string;
}

/** 我自己的选题输入，脚本改写的另一半原料。 */
export interface TopicInput {
  /** 这条视频讲什么 */
  topic: string;
  /** 产品/服务，没有就留空 */
  product: string;
  /** 卖点或核心观点，一行一条 */
  sellingPoints: string;
  /** 目标观众 */
  audience: string;
}

/** 目标时长的默认档，新建项目与服务端兜底共用。 */
export const DEFAULT_TARGET_DURATION_SEC = 45;

/** 空选题：新建项目与请求兜底共用，别在各路由各写一份。 */
export const EMPTY_TOPIC_INPUT: TopicInput = { topic: "", product: "", sellingPoints: "", audience: "" };

/** 项目里绑定的一张参考图：来自素材库或现场上传，落在项目目录里固定不变。 */
export interface CastRef {
  /** 素材库里的 id；现场上传的没有 */
  assetId: string;
  /** 给人看的名字，如「模特 A」「米色开衫」 */
  label: string;
  /** 拷进项目目录后的绝对路径，生成首帧时直接当参考图用 */
  path: string;
}

/** 角色、产品、场景三个槽位。生成每一镜首帧时都会带上，这是跨镜一致性的唯一抓手。 */
export interface ProjectCast {
  role: CastRef | null;
  product: CastRef | null;
  scene: CastRef | null;
}

export type CastSlot = keyof ProjectCast;

/**
 * 槽位表。库名沿用图片工厂那三个库，但这里写字面量而不是引 LibraryKind——
 * 图片和视频两条线的类型不互相牵连（见文件头）。
 *
 * usage 是写进首帧提示词的用途约束，必须逐槽位写：
 * 参考图给了却不说清楚只取它的哪一部分，模型会把角色图里的场景、场景图里的人一起抄过来。
 */
export const CAST_SLOTS: Array<{
  id: CastSlot;
  label: string;
  hint: string;
  library: "models" | "products" | "scenes";
  usage: string;
}> = [
  {
    id: "role",
    label: "角色",
    hint: "出镜的人。不选的话每一镜都会换脸。",
    library: "models",
    usage: "只参考这个人的长相、发型、肤色和体型，不要照搬图里的衣着、场景和光线",
  },
  {
    id: "product",
    label: "产品",
    hint: "要卖的东西。不选的话每一镜的货都长得不一样。",
    library: "products",
    usage: "只参考这件东西的款式、颜色、材质和细节，不要照搬图里的场景和光线",
  },
  {
    id: "scene",
    label: "场景",
    hint: "在哪儿拍。不绑就按分镜提示词现编，同一句「门店」每镜也不是同一家。",
    library: "scenes",
    usage: "参考这个环境的空间结构、陈设、光线方向和色调，画面里的人和货不从这张图取",
  },
];

export const EMPTY_CAST: ProjectCast = { role: null, product: null, scene: null };

export interface VideoProject {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** 没有对标来源时为 null，直接从选题起步也允许 */
  skeleton: BenchmarkSkeleton | null;
  topic: TopicInput;
  /** 用户定的目标时长，脚本写完要拿它跟估算比，所以得跟着项目存 */
  targetDurationSec: number;
  /** 套用的对标节奏模板；整份存进项目，删掉原模板也不影响这条已经在做的片子 */
  rhythm: BenchmarkRhythm | null;
  /** 绑定的角色与产品参考图，生成每一镜首帧时自动带上 */
  cast: ProjectCast;
  /**
   * 这条片子用哪个引擎出片。
   * 分镜的时长档位由它决定，所以它必须先于 storyboard 定下来，并且跟着项目走。
   * 老项目没有这个字段，读取时回落到 grok-cli——那是加这个字段之前唯一能生成的引擎。
   */
  genProvider: VideoGenProviderId;
  script: ScriptDraft | null;
  storyboard: Storyboard | null;
  clips: ShotClip[];
}

/** 引擎下可选的驱动模型。形状与 lib/imageFactory 的 ImageCliModel 一致，但不跨模块引用——
 *  图片和视频两条线的模型来源不同，共用一个类型只会让改动互相牵连。 */
export interface VideoGenModel {
  id: string;
  label: string;
}

/** 图生视频引擎的可用状态，形状对齐 lib/imageFactory 的 CliProviderStatus。 */
export interface VideoGenProviderStatus {
  id: VideoGenProviderId;
  name: string;
  available: boolean;
  authenticated: boolean;
  version?: string;
  message: string;
  /** 探到的可选模型；CLI 与回传通道没有这个概念，留空即可 */
  models?: VideoGenModel[];
  /** 不选模型时用哪个，用于在下拉里标「默认」 */
  defaultModel?: string;
}

/** 一次图生视频的产出。 */
export interface ShotGenerationResult {
  projectId: string;
  shotOrder: number;
  clip: ShotClip;
}

export const VIDEO_FACTORY_STEPS = [
  { id: "source", label: "对标来源", hint: "拆片结构或直接起步" },
  { id: "script", label: "脚本改写", hint: "借结构，换素材" },
  { id: "storyboard", label: "分镜表", hint: "切镜 + 两套提示词" },
  { id: "generate", label: "视频生成", hint: "首帧图 → 图生视频" },
] as const;

export type VideoFactoryStepId = (typeof VIDEO_FACTORY_STEPS)[number]["id"];
