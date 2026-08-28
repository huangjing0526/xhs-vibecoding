/**
 * 爆款节奏拆解：把一条对标视频的真实切镜点提出来，变成可套用的节奏模板。
 *
 * 切镜是 ffmpeg 的 scene 滤镜算出来的硬数据，不过模型——模型猜不出「开头 5 秒切三刀」这种事，
 * 而那恰恰是爆款最值钱的部分。拿到的只是时间码和缩略图，原视频的画面与音频一概不进下游。
 */

import type { ReplicabilityReport } from "./replicability";
import { PROVIDER_CAPS, type ShotDuration, type VideoGenProviderId } from "./types";

/** 一镜怎么落到生成引擎上：引擎的档位是离散的，短镜头一律「生成长的，剪短用」。 */
export type ShotPlanKind = "exact" | "trim" | "split";

export interface BenchmarkShotPlan {
  kind: ShotPlanKind;
  /** 要生成几段（只有 split 时大于 1） */
  segments: number;
  /** 每段生成多长 */
  generateSec: ShotDuration;
  /** 成片里这一镜实际用多长 */
  trimToSec: number;
}

/**
 * 一项结构指标测不出来时，说清楚是为什么。
 *
 * 这是这套量化的硬规矩：宁可标「测不了」，也不给一个错的数。
 * 拿一个错的绿灯去指导生成，比没有数危险得多——实测里
 * 「服装色块面积」当尺度代理会因为腿部入画而给出方向完全相反的结论。
 */
export type MetricUnavailable =
  | "no-face"        // 整镜没检出人脸：无人镜、背影、侧脸、特写超出画面
  | "face-too-small" // 检出了但像素太少，特征不可信
  | "subject-edge"   // 主体占住画面边缘，背景判据失效
  | "no-model"       // 人脸模型没装
  | "too-short"      // 镜头太短，采不到足够的帧
  | "low-snr";       // 位移量和检测抖动同量级，分段只会是在给噪声编故事

/** 机位在这一镜里动没动。背景不在画面边缘时判不了，那时给 unknown。 */
export type CameraMotion = "fixed" | "slight" | "moving" | "unknown";

/**
 * 一镜量出来的结构。全部可选——测不出来就没有，而不是填 0。
 *
 * 为什么是人脸宽度而不是别的：跨片段唯一稳的尺度代理。
 * 门框宽度只在同场景内可用（门会移出画面、会被头发填进测量行），
 * 发团面积遇到棕发模特直接失灵，服装色块会被腿部入画反向污染——
 * 这三种都实测翻过车。
 */
export interface BenchmarkShotMetrics {
  /** 机位：背景带的帧间变化率。只看前半程，避开主体走近后遮挡边缘 */
  cameraMotion: CameraMotion;
  /** 背景带帧间变化的原始值，给人判断用 */
  backgroundDrift?: number;
  /** 人物尺度：末帧人脸宽 / 首帧人脸宽。>1 越走越近，<1 越退越远 */
  subjectScaleRatio?: number;
  /** 末帧人脸宽占画宽的比例，等于「这一镜收在什么景别」 */
  endFaceWidth?: number;
  /** 节奏三段的时间占比，加起来是 1。静止→运动→定格 */
  tempo?: { holdPct: number; movePct: number; settlePct: number };
  /** 尾段还在动多少：越接近 0 越是干净的定格，硬切接得上 */
  settleJitter?: number;
  /** 逐项说明为什么没测出来，键是上面那些可选字段名 */
  unavailable?: Partial<Record<"subjectScaleRatio" | "endFaceWidth" | "tempo" | "cameraMotion", MetricUnavailable>>;
}

/**
 * 对标片里一个可替换的实体。用户拿自己的素材换掉的就是它。
 *
 * 为什么单独成表，而不是把主体直接写进每镜描述：
 * 「换成自己的产品」这件事的单位是实体，不是镜头——一件外套出现在第 4、6 两镜，
 * 绑一次就该两镜都换。描述里只留占位符，替换在代码里做，模型不参与。
 */
export type BenchmarkCastKind = "role" | "product" | "scene";

/** 三类实体的中文说法。占位符、界面、提示词共用这一份，别在各处各写一遍。 */
export const CAST_KIND_LABEL: Record<BenchmarkCastKind, string> = {
  role: "角色",
  product: "产品",
  scene: "场景",
};

export interface BenchmarkCastEntity {
  kind: BenchmarkCastKind;
  /** 同类里的序号，从 1 起。和 kind 一起构成占位符「角色1」 */
  index: number;
  /**
   * 它在对标片里是什么，一句话。
   *
   * 颗粒度停在类型和结构：「女性模特」「白色长袖衬衫」「室内浅色走廊」。
   * 不写到能认出具体是谁、具体哪件商品——那越过了「借结构、换素材」的边界。
   */
  label: string;
  /** 出现在对标片的哪几镜。绑一次要换哪几镜，看的就是这个 */
  shots: number[];
}

/** 占位符里的写法，如「角色1」。中文，给模型和界面看。 */
export function castToken(entity: Pick<BenchmarkCastEntity, "kind" | "index">): string {
  return `${CAST_KIND_LABEL[entity.kind]}${entity.index}`;
}

/** 落盘和 URL 里的写法，如「role-1」。中文 token 不进文件名。 */
export function castTokenSlug(entity: Pick<BenchmarkCastEntity, "kind" | "index">): string {
  return `${entity.kind}-${entity.index}`;
}

/**
 * 从模型给的中文 token 反解回实体键，如「角色1」→ role/1。认不出返回 null。
 *
 * 编号由模型定、服务端只做校验，不重新编号：描述里的占位符是模型同一次写下的，
 * 服务端一改号，那些占位符就全成了对不上的孤儿。
 */
export function parseCastToken(token: string): { kind: BenchmarkCastKind; index: number } | null {
  const match = /^(角色|产品|场景)([1-9])$/.exec(token.trim());
  if (!match) return null;
  const kind = (Object.keys(CAST_KIND_LABEL) as BenchmarkCastKind[]).find(
    (key) => CAST_KIND_LABEL[key] === match[1],
  );
  return kind ? { kind, index: Number(match[2]) } : null;
}

/**
 * 一镜的画面内容，四段对齐 framePrompt 的写法要求：主体、构图、光线、场景。
 *
 * subject 和 scene 里的主体写成占位符「{角色1}」「{产品2}」，
 * 换素材时就是确定性的字符串替换——结构、构图、光线原样保留，只有主体变。
 * 交给模型重新理解一遍的话，同一份对标每次改写出来的画面都不一样。
 */
export interface BenchmarkShotContent {
  /** 主体在做什么。主体处用占位符 */
  subject: string;
  /** 景别 + 构图 */
  framing: string;
  /** 光线 + 色调 */
  light: string;
  /** 场景元素。场景主体处用占位符 */
  scene: string;
}

export interface BenchmarkShot {
  order: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  plan: BenchmarkShotPlan;
  /** 量出来的结构。老的节奏模板没有这一项，读的地方都要当它可能不在 */
  metrics?: BenchmarkShotMetrics;
  /**
   * 这一镜画面里是什么。看片时抽到了才有——
   * 抽样上限之外的镜头就是没看到，这里留空而不是编一段，和 metrics 一个规矩。
   */
  content?: BenchmarkShotContent;
}

export interface BenchmarkRhythm {
  id: string;
  /** 「@作者《标题》」或上传的文件名，用来认出这是哪条 */
  sourceLabel: string;
  totalDurationSec: number;
  width: number;
  height: number;
  /** 检测灵敏度，重测时原样回传，方便对比 */
  threshold: number;
  shots: BenchmarkShot[];
  createdAt: string;
  /** 可复刻性筛查结论；没查过就没有 */
  report?: ReplicabilityReport;
  /** 这条片子里可替换的实体清单。看过片才有 */
  cast?: BenchmarkCastEntity[];
}

/** 灵敏度档位：同一条片子换个阈值，切出来的镜头数能差一倍，所以要让人能调。 */
export const RHYTHM_THRESHOLDS = [
  { value: 0.2, label: "敏感", hint: "连轻微的运镜切换也算一刀，镜头会偏多" },
  { value: 0.3, label: "默认", hint: "大多数短视频用这档" },
  { value: 0.45, label: "保守", hint: "只认明显的硬切，适合画面本来就乱的片子" },
] as const;

/** 低于这个长度的「镜头」基本是闪频误判，并进前一镜。 */
export const MIN_SHOT_SEC = 0.3;

/**
 * 一镜的生成方案。
 * 引擎的最短档通常都长于爆款里的大量镜头——多生成的部分剪掉就是了，
 * 一次生成的成本不变，换来的是精确的节奏。
 *
 * 档位由引擎决定（grok 6/10、Veo 4/6/8），所以必须把它作为参数传进来。
 */
export function planBenchmarkShot(
  durationSec: number,
  durations: readonly ShotDuration[],
): BenchmarkShotPlan {
  const trimToSec = Math.round(durationSec * 10) / 10;
  const ladder = [...durations].sort((a, b) => a - b);
  const shortest = ladder[0];
  const longest = ladder[ladder.length - 1];

  if (ladder.includes(trimToSec as ShotDuration)) {
    return { kind: "exact", segments: 1, generateSec: trimToSec as ShotDuration, trimToSec };
  }
  // 比最短档还短：生成最短档再剪
  if (trimToSec < shortest) return { kind: "trim", segments: 1, generateSec: shortest, trimToSec };
  // 落在档位之间：生成刚好盖得住它的那一档
  const fit = ladder.find((value) => value >= trimToSec);
  if (fit) return { kind: "trim", segments: 1, generateSec: fit, trimToSec };
  // 比最长档还长：拆成多段用最长档接起来
  return { kind: "split", segments: Math.ceil(trimToSec / longest), generateSec: longest, trimToSec };
}

/** 把切镜时间点折成镜头表：合并误判、补上首尾、算好每镜的生成方案。 */
export function cutsToShots(
  cutSeconds: number[],
  totalDurationSec: number,
  durations: readonly ShotDuration[],
): BenchmarkShot[] {
  const bounds = [0, ...cutSeconds, totalDurationSec]
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= totalDurationSec)
    .sort((a, b) => a - b);

  // 相邻太近的切点是闪频/转场误判，只保留前一个
  const merged: number[] = [];
  for (const value of bounds) {
    if (!merged.length || value - merged[merged.length - 1] >= MIN_SHOT_SEC) merged.push(value);
  }
  if (merged[merged.length - 1] !== totalDurationSec) merged[merged.length - 1] = totalDurationSec;

  const shots: BenchmarkShot[] = [];
  for (let index = 0; index < merged.length - 1; index += 1) {
    const startSec = Math.round(merged[index] * 100) / 100;
    const endSec = Math.round(merged[index + 1] * 100) / 100;
    const durationSec = Math.round((endSec - startSec) * 100) / 100;
    shots.push({
      order: shots.length + 1,
      startSec,
      endSec,
      durationSec,
      plan: planBenchmarkShot(durationSec, durations),
    });
  }
  return shots;
}

/**
 * 按另一个引擎的档位把节奏模板重算一遍。
 *
 * 节奏模板是独立存的、可以被多个项目套用，而每个项目的引擎不一定相同——
 * 存进模板里的那份 plan 只是切镜时用某个引擎算出来的一种落法，不是模板的固有属性。
 * 所以项目真要用它时，按项目自己的引擎重算，切点本身（startSec/endSec）不动。
 */
export function replanRhythm(
  rhythm: BenchmarkRhythm,
  provider: VideoGenProviderId,
): BenchmarkRhythm {
  const durations = PROVIDER_CAPS[provider].durations;
  // 回传通道没有档位约束，原样返回：那种项目的片子是在别处生成好再传回来的
  if (!durations.length) return rhythm;
  return {
    ...rhythm,
    shots: rhythm.shots.map((shot) => ({
      ...shot,
      plan: planBenchmarkShot(shot.durationSec, durations),
    })),
  };
}

export interface RhythmStats {
  shotCount: number;
  averageSec: number;
  shortestSec: number;
  longestSec: number;
  /** 短于引擎最短档、必须靠「生成长剪短用」的镜头数 */
  trimCount: number;
  /** 超过引擎最长档、要拆成多段接起来的镜头数 */
  splitCount: number;
  /** 开头 5 秒里切了几刀——爆款的钩子密度都藏在这个数里 */
  openingCuts: number;
  /** 全部落地需要生成多少段 */
  totalSegments: number;
}

export function summarizeRhythm(rhythm: BenchmarkRhythm): RhythmStats {
  const durations = rhythm.shots.map((shot) => shot.durationSec);
  const total = durations.reduce((sum, value) => sum + value, 0);
  return {
    shotCount: rhythm.shots.length,
    averageSec: rhythm.shots.length ? Math.round((total / rhythm.shots.length) * 10) / 10 : 0,
    shortestSec: durations.length ? Math.min(...durations) : 0,
    longestSec: durations.length ? Math.max(...durations) : 0,
    trimCount: rhythm.shots.filter((shot) => shot.plan.kind === "trim").length,
    splitCount: rhythm.shots.filter((shot) => shot.plan.kind === "split").length,
    openingCuts: rhythm.shots.filter((shot) => shot.startSec > 0 && shot.startSec <= 5).length,
    totalSegments: rhythm.shots.reduce((sum, shot) => sum + shot.plan.segments, 0),
  };
}

/** 一镜的快慢档。节奏条的配色只编码这一件事。 */
export type ShotTone = "fast" | "normal" | "long";

/** 低于这个秒数算「快切」。爆款的钩子密度就藏在快切的数量里。 */
export const FAST_CUT_SEC = 2;

export function shotTone(shot: BenchmarkShot): ShotTone {
  if (shot.plan.kind === "split") return "long";
  return shot.durationSec < FAST_CUT_SEC ? "fast" : "normal";
}

/** 快切深、常规浅、长镜发暖。节奏面板的宽条和模板卡的竖条共用这一套，两处颜色不能各说各的。 */
export const SHOT_TONE_BAR: Record<ShotTone, string> = {
  fast: "bg-brand-500",
  normal: "bg-brand-200",
  long: "bg-warn/60",
};

/**
 * 一句话读懂这条节奏：多少镜、切得多碎、开场几连切。
 * 挑对标时真正要比的就是这三个数，模板卡和节奏面板都要说一遍，所以只写这一处。
 */
export function describeRhythm(rhythm: BenchmarkRhythm): string {
  const stat = summarizeRhythm(rhythm);
  const opening = stat.openingCuts >= 2 ? ` · 开场 ${stat.openingCuts} 连切` : "";
  return `${stat.shotCount} 镜 · ${formatTimecode(rhythm.totalDurationSec)} · 平均 ${stat.averageSec}s${opening}`;
}

/** 时间码，节奏条和镜头清单共用一种写法。 */
export function formatTimecode(seconds: number): string {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}.${Math.round((seconds - whole) * 10)}`;
}

/** 节奏模板套进分镜时，喂给模型的那份时长清单。 */
export function rhythmToPlanLines(rhythm: BenchmarkRhythm): string {
  return rhythm.shots
    .flatMap((shot) =>
      shot.plan.segments > 1
        ? Array.from({ length: shot.plan.segments }, (_, index) => {
            // 长镜头拆成多段，最后一段承担余数
            const used = index === shot.plan.segments - 1
              ? Math.round((shot.durationSec - shot.plan.generateSec * index) * 10) / 10
              : shot.plan.generateSec;
            return `第 ${shot.order}-${index + 1} 镜：成片 ${used} 秒`;
          })
        : [`第 ${shot.order} 镜：成片 ${shot.plan.trimToSec} 秒`],
    )
    .join("\n");
}

/** 套用节奏后总共要切多少镜——长镜头拆过段，和对标镜头数不是一回事。 */
export function rhythmShotCount(rhythm: BenchmarkRhythm): number {
  return rhythm.shots.reduce((sum, shot) => sum + shot.plan.segments, 0);
}

export const CAMERA_MOTION_LABEL: Record<CameraMotion, string> = {
  fixed: "固定机位",
  slight: "轻微移动",
  moving: "机位移动",
  unknown: "机位未知",
};

export const METRIC_UNAVAILABLE_LABEL: Record<MetricUnavailable, string> = {
  "no-face": "这一镜没检出人脸",
  "face-too-small": "人脸太小，测不准",
  "subject-edge": "主体占住画面边缘",
  "no-model": "人脸模型未安装",
  "too-short": "镜头太短，采样不足",
  "low-snr": "位移太小，分不出段",
};

/** 人物尺度倍率读成人话。走近/后退比一个裸数字好懂。 */
export function describeSubjectScale(ratio: number): string {
  if (ratio >= 1.25) return `走近 ${ratio.toFixed(2)}×`;
  if (ratio <= 0.8) return `后退 ${(1 / ratio).toFixed(2)}×`;
  return "景别基本不变";
}

/**
 * 一镜的结构写成一行。测不出来的部分不出现，而不是显示占位符——
 * 面板上少一项，比多一项看不懂的「--」有用。
 */
export function describeShotMetrics(metrics: BenchmarkShotMetrics | undefined): string {
  if (!metrics) return "";
  const parts: string[] = [];
  if (metrics.cameraMotion !== "unknown") parts.push(CAMERA_MOTION_LABEL[metrics.cameraMotion]);
  if (metrics.subjectScaleRatio) parts.push(describeSubjectScale(metrics.subjectScaleRatio));
  if (metrics.tempo) {
    const { holdPct, movePct, settlePct } = metrics.tempo;
    parts.push(`静${Math.round(holdPct * 100)}/动${Math.round(movePct * 100)}/定${Math.round(settlePct * 100)}`);
  }
  return parts.join(" · ");
}

/**
 * 把量出来的结构写成喂给模型的约束行，B 阶段拆分镜时用。
 *
 * 只写测出来的：没测到的项一个字都不提，免得模型拿占位符当真去编。
 */
export function shotMetricsToPrompt(shot: BenchmarkShot): string {
  const m = shot.metrics;
  if (!m) return "";
  const lines: string[] = [];
  if (m.cameraMotion === "fixed") lines.push("机位固定，全程不推不拉不摇");
  if (m.cameraMotion === "moving") lines.push("机位移动，跟随主体");
  if (m.subjectScaleRatio) lines.push(`主体${describeSubjectScale(m.subjectScaleRatio)}`);
  if (m.tempo) {
    lines.push(
      `节奏：前 ${Math.round(m.tempo.holdPct * 100)}% 静止、` +
        `中 ${Math.round(m.tempo.movePct * 100)}% 运动、` +
        `末 ${Math.round(m.tempo.settlePct * 100)}% 定格`,
    );
  }
  return lines.join("；");
}

/** 占位符长这样：{角色1}、{产品2}。花括号里只允许没有嵌套的一段。 */
const CAST_TOKEN_PATTERN = /\{([^{}]+)\}/g;

/**
 * 把描述里的占位符换成实际名字。
 *
 * 没绑素材的实体换成它在对标里的说法（「女性模特」），认不出的占位符脱掉括号——
 * 两种情况都不留花括号出去：一个换不掉的 {角色1} 漏进首帧提示词，
 * 模型会真的照着把括号画进画面里。宁可退化成自然语言，也不留半成品记号。
 */
export function resolveCastTokens(text: string, names: Map<string, string>): string {
  return text.replace(CAST_TOKEN_PATTERN, (_, token: string) => {
    const key = token.trim();
    return names.get(key) || key;
  });
}

/** 描述里实际用到的占位符，按出现顺序去重。校验模型有没有编出清单外的实体时用。 */
export function usedCastTokens(content: BenchmarkShotContent): string[] {
  const seen = new Set<string>();
  for (const text of [content.subject, content.scene, content.framing, content.light]) {
    for (const match of text.matchAll(CAST_TOKEN_PATTERN)) seen.add(match[1].trim());
  }
  return [...seen];
}

/**
 * 一镜的内容写成喂给分镜模型的几行。
 * names 传进来做占位符替换：模型看到的应该是已经换好主体的画面，不是带记号的模板。
 */
export function shotContentToPrompt(content: BenchmarkShotContent, names: Map<string, string>): string {
  const parts = [
    content.subject && `主体：${resolveCastTokens(content.subject, names)}`,
    content.framing && `构图：${content.framing}`,
    content.light && `光线：${content.light}`,
    content.scene && `场景：${resolveCastTokens(content.scene, names)}`,
  ].filter(Boolean);
  return parts.join("；");
}

/**
 * 没描述到的镜号。
 * 抽样上限之外的镜头就是没看到，得说出来——和 metrics「测不了就标测不了」同一条规矩，
 * 不然分镜表会拿一份缺了几镜的底稿假装完整。
 */
export function undescribedShots(rhythm: BenchmarkRhythm): number[] {
  return rhythm.shots.filter((shot) => !shot.content).map((shot) => shot.order);
}

/** 实体清单写成给分镜模型看的对照表：占位符 → 换成了什么。 */
export function castToPromptLines(cast: BenchmarkCastEntity[], names: Map<string, string>): string {
  return cast
    .map((entity) => {
      const token = castToken(entity);
      const bound = names.get(token);
      const shots = entity.shots.length ? `（对标第 ${entity.shots.join("、")} 镜）` : "";
      return bound && bound !== entity.label
        ? `- ${CAST_KIND_LABEL[entity.kind]}「${bound}」${shots}：对标里这个位置是${entity.label}，换成你的`
        : `- ${CAST_KIND_LABEL[entity.kind]}「${entity.label}」${shots}：没换，照对标的类型写`;
    })
    .join("\n");
}
