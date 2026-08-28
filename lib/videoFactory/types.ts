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
  // 走编辑通道的镜头也落在这条：VACE / 可灵 / Runway 这些都在各自平台上手动跑，
  // 我们负责切好片、标好哪镜要换什么，成片传回来。
  // 没给「能不能接编辑活」单开一个能力位——那会是 UPLOAD_PROVIDERS 的第二张表，
  // 而下面那条注释刚说过两张表迟早给出相反的答案。等真接了编辑 API 再按路线建模。
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
  /**
   * 这一镜对应对标片的第几镜。套了节奏模板才有。
   * 留着是为了能回去看这一镜的实测结构，也为了生成完能拿实测值验收。
   */
  sourceShotOrder?: number;
  /**
   * 这一镜单独指定的素材。可选——不填就用项目级的角色/产品/场景。
   *
   * 为什么要有：换装、多产品、多场景这类片子，每一镜要看的本来就不是同一件东西，
   * 三个项目级槽位表达不了。但也不能改成纯每镜——项目级槽位是跨镜一致性的抓手，
   * 六镜共用一张角色图才不会换脸。所以是「可选覆盖」而不是「取代」。
   */
  material?: CastRef;
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

/**
 * 视频作品：一镜成片在作品库里的视图，由 ShotClip 投影而来。
 * Omit 掉的两个盘上路径不外发，取流走 clipUrl；删除与重跑归项目所有，作品库只看、只下载。
 */
export type VideoWork = Omit<ShotClip, "videoPath" | "framePath"> & {
  kind: "video";
  /** 列表键：projectId/shotOrder */
  id: string;
  projectId: string;
  projectTitle: string;
  /** 取流地址（clip 端点），浏览器按需拉 */
  videoUrl: string;
};

/**
 * 某一镜成片的取流地址。URL 形状只在这里拼一次，服务端投影与客户端播放共用；
 * version 用于重跑覆盖同名文件后顶掉浏览器缓存（+1 即失效）。
 */
export function clipUrl(projectId: string, shotOrder: number, version?: number): string {
  const base = `/api/video-factory/clip?projectId=${encodeURIComponent(projectId)}&shot=${shotOrder}`;
  return version ? `${base}&v=${version}` : base;
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
   * 对标实体 → 你自己的素材。键是占位符 token，如「角色1」「产品2」。
   *
   * 和 cast 的分工：cast 是三个项目级槽位，没套对标时的唯一抓手；
   * 这份是套了对标之后按实体绑的，一个实体出现在哪几镜就管哪几镜。
   * 两者并存不冲突——取参考图时实体绑定优先，没绑到的镜头回落到 cast。
   */
  castBinding: Record<string, CastRef>;
  /**
   * 这条片子用哪个引擎出片。
   * 分镜的时长档位由它决定，所以它必须先于 storyboard 定下来，并且跟着项目走。
   * 老项目没有这个字段，读取时回落到 grok-cli——那是加这个字段之前唯一能生成的引擎。
   */
  genProvider: VideoGenProviderId;
  script: ScriptDraft | null;
  storyboard: Storyboard | null;
  clips: ShotClip[];
  /** 各镜配音，和 clips 一样归服务端所有，前端存盘不上送 */
  voiceovers: ShotVoiceover[];
  /** 最近一次合成的成片；没合成过是 null */
  finalCut: FinalCut | null;
}

/** 一条项目做到哪一步了。项目页与工厂里「最近的项目」共用同一套说法，不各写一遍三元。 */
export function describeProjectProgress(project: VideoProject): string {
  const stage = project.storyboard ? `${project.storyboard.shots.length} 镜` : project.script ? "已出脚本" : "只有选题";
  return project.clips.length > 0 ? `${stage} · 已生成 ${project.clips.length} 镜` : stage;
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

/**
 * 一镜的配音。
 * text 是合成时用的那句原文——与分镜里的 voiceover 对不上就说明口播改过了，
 * 该重配而不是拿旧音频硬拼。没有它就只能每次全量重配，慢且白花钱。
 */
export interface ShotVoiceover {
  shotOrder: number;
  text: string;
  /** 落在项目目录里的绝对路径 */
  path: string;
  durationSec: number;
  voice: string;
  rate: string;
  createdAt: string;
}

/** 配音音色与语速的默认值。干货口播语速偏快，默认就调上去，免得每条都要手改。 */
export const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";
export const DEFAULT_VOICE_RATE = "+30%";

/** 可选音色。数量刻意少——微软中文女声实际只有这两个能用于口播。 */
export const VOICE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "zh-CN-XiaoxiaoNeural", label: "晓晓（温暖·通用）" },
  { id: "zh-CN-XiaoyiNeural", label: "晓伊（活泼·偏年轻）" },
  { id: "zh-CN-YunxiNeural", label: "云希（男声·阳光）" },
  { id: "zh-CN-YunyangNeural", label: "云扬（男声·专业）" },
];

/** 口播说完之后多留一点点画面，镜头不要在字音落下的同一帧就切走。 */
export const VOICEOVER_TAIL_SEC = 0.35;

/**
 * 合成产出。
 * 重跑覆盖同一个文件，所以只留一份；extendedShots 是给人看的账：
 * 哪几镜为了放下口播而突破了对标节奏，超了多少。
 */
export interface FinalCut {
  path: string;
  durationSec: number;
  withSubtitles: boolean;
  withVoiceover: boolean;
  createdAt: string;
  extendedShots: Array<{ shotOrder: number; plannedSec: number; actualSec: number }>;
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
  { id: "compose", label: "字幕与成片", hint: "配音 + 字幕 + 拼接" },
] as const;

export type VideoFactoryStepId = (typeof VIDEO_FACTORY_STEPS)[number]["id"];
