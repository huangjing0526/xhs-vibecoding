/**
 * 切点踩没踩节拍：从音频包络里读起音点，再看对标的切点落在上面多少。
 *
 * 为什么不上 librosa 之类的节拍跟踪：这里要的不是 BPM，而是「切点是不是卡着声音的重音落的」。
 * 逐窗 RMS 的正差分就够回答，代价是一次 ffmpeg，不引新依赖。
 *
 * 纯计算，不碰文件——ffmpeg 那半截在路由里，这样这套判据能拿一串数直接验。
 */

import type { BenchmarkBeatSync } from "./benchmark";

/** 一个采样窗的响度。 */
export interface LoudnessSample {
  atSec: number;
  /** dBFS，静音是 -90 */
  db: number;
}

/**
 * 切点和起音点差多少还算踩上了。
 *
 * 0.12 秒 ≈ 3 帧。再紧就会被剪辑本身的零点几帧误差甩掉，
 * 再松则起音点密的片子会人人及格——实测放到 0.2 秒，一条完全不卡点的片子也能到 52%。
 */
export const BEAT_TOLERANCE_SEC = 0.12;

/** 两个起音点至少隔这么远，否则算同一下。 */
const MIN_ONSET_GAP_SEC = 0.1;

/** 自适应阈值的窗口半径（单位是采样窗），和高出局部标准差几倍才算一下。 */
const FLUX_WINDOW = 21;
const FLUX_SIGMA = 1.5;

/** 低于这个的响度抬升一律不算起音——底噪的抖动能有零点几 dB。 */
const MIN_FLUX_DB = 0.5;

/**
 * 从响度序列里找起音点。
 *
 * 判据是响度的正向跳变高出局部波动一大截，且是局部最大的那一个。
 * 用局部窗口而不是全局阈值，是因为一条片子里前奏和高潮的底噪差十几 dB，
 * 全局阈值要么在安静段找不到东西，要么在响的段把每一窗都算成起音。
 */
export function detectOnsets(samples: LoudnessSample[]): number[] {
  if (samples.length < 3) return [];
  const flux = samples.map((sample, index) =>
    index === 0 ? 0 : Math.max(0, sample.db - samples[index - 1].db),
  );

  const onsets: number[] = [];
  let last = -Infinity;
  for (let index = 0; index < flux.length; index += 1) {
    if (flux[index] < MIN_FLUX_DB) continue;
    const lo = Math.max(0, index - FLUX_WINDOW);
    const hi = Math.min(flux.length, index + FLUX_WINDOW + 1);
    const window = flux.slice(lo, hi);
    const mean = window.reduce((sum, value) => sum + value, 0) / window.length;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / window.length;
    const sigma = Math.sqrt(variance);
    // 必须是窗口里最大的那一下：不加这条，一次渐强会被记成连续七八个起音点
    if (flux[index] <= mean + FLUX_SIGMA * sigma || flux[index] < Math.max(...window)) continue;
    const at = samples[index].atSec;
    if (at - last < MIN_ONSET_GAP_SEC) continue;
    onsets.push(at);
    last = at;
  }
  return onsets;
}

/**
 * 切点对起音点的命中率，连同随机基线一起给。
 *
 * 基线是这套判据里最要紧的一项：起音点密到一定程度，随便撒的切点也能蒙对一大半。
 * 近似成「每个切点落进任一起音点 ±容差窗的概率」= 覆盖的总时长占比，
 * 实测和真的随机撒点跑出来的数只差几个百分点，够用来做参照了。
 */
export function measureBeatSync(
  cutsSec: number[],
  onsets: number[],
  durationSec: number,
): BenchmarkBeatSync {
  const tolerance = BEAT_TOLERANCE_SEC;
  if (!cutsSec.length) return { alignedPct: 0, expectedPct: 0, cuts: 0, unavailable: "no-onsets" };
  if (!onsets.length || durationSec <= 0) {
    return { alignedPct: 0, expectedPct: 0, cuts: cutsSec.length, unavailable: "no-onsets" };
  }

  const aligned = cutsSec.filter((cut) =>
    onsets.some((onset) => Math.abs(cut - onset) <= tolerance),
  ).length;
  // 起音点的容差窗会互相重叠，所以覆盖率要封顶到 1，不然密集片段能算出大于 1 的概率
  const expectedPct = Math.min(1, (2 * tolerance * onsets.length) / durationSec);

  return {
    alignedPct: aligned / cutsSec.length,
    expectedPct,
    cuts: cutsSec.length,
  };
}

/** 判定绑着原曲要同时过两关：绝对对齐率够高，且明显高于随机基线。 */
export const BEAT_LOCKED_PCT = 0.6;
export const BEAT_LOCKED_LIFT = 1.5;

export function beatLocked(sync?: BenchmarkBeatSync): boolean {
  if (!sync || sync.unavailable) return false;
  return sync.alignedPct >= BEAT_LOCKED_PCT && sync.alignedPct >= sync.expectedPct * BEAT_LOCKED_LIFT;
}

/** 一句话说清这条节奏换 BGM 之后要不要重排切点。 */
export function describeBeatSync(sync?: BenchmarkBeatSync): string {
  if (!sync) return "";
  if (sync.unavailable === "no-audio") return "原片没有音轨，切点跟音乐无关，换 BGM 随便换";
  if (sync.unavailable === "no-onsets") return "音轨太平，读不出起音点，节拍对齐测不了";
  const pct = Math.round(sync.alignedPct * 100);
  const base = Math.round(sync.expectedPct * 100);
  return beatLocked(sync)
    ? `${sync.cuts} 个切点里 ${pct}% 踩在起音点上（随机基线 ${base}%）——这条节奏绑着原曲，换 BGM 要按新曲重排切点`
    : `${sync.cuts} 个切点 ${pct}% 踩在起音点上，和随机基线 ${base}% 差不多，节奏不依赖原曲，换 BGM 不用重排`;
}
