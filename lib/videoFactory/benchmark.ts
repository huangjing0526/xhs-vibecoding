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

export interface BenchmarkShot {
  order: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  plan: BenchmarkShotPlan;
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
