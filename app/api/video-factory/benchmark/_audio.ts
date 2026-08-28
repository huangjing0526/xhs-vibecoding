/**
 * 读原片音轨，回答一个问题：这套节奏换了 BGM 还成不成立。
 *
 * 音频只在这儿被读一次，读完就丢——原声不进下游，成片的口播和 BGM 全是自己的。
 * 拿到的只有一串响度数和由它算出的对齐率。
 */

import { runCommand } from "@/app/api/video-factory/_shared";
import { detectOnsets, measureBeatSync, type BenchmarkBeatSync, type LoudnessSample } from "@/lib/videoFactory";

const AUDIO_TIMEOUT_MS = 2 * 60 * 1000;

/** 每窗的采样数。44.1k 下约 23 毫秒一窗，比要判的 0.12 秒容差细五倍，够了。 */
const WINDOW_SAMPLES = 1024;

/** ffmpeg 对纯静音给的是 -inf，换成一个够低的实数，免得后面的差分全成 NaN。 */
const SILENCE_DB = -90;

/** 有没有音轨。没有就不用往下走了——一条片子本来就无声，谈不上踩不踩节拍。 */
async function hasAudioStream(source: string): Promise<boolean> {
  const out = await runCommand(
    "ffprobe",
    ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", source],
    { timeoutMs: AUDIO_TIMEOUT_MS },
  );
  return out.includes("audio");
}

/**
 * 逐窗响度。
 *
 * ffmpeg 把时间和数值分成两行吐，所以要成对读：先看到 pts_time 记下时刻，
 * 下一行的 RMS 才是这个时刻的。按行独立解析会把两者错开一窗。
 */
async function readLoudness(source: string): Promise<LoudnessSample[]> {
  const out = await runCommand(
    "ffmpeg",
    [
      "-hide_banner", "-v", "error",
      "-i", source,
      "-map", "0:a:0",
      "-af",
      `asetnsamples=n=${WINDOW_SAMPLES},astats=metadata=1:reset=1,` +
        "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
      "-f", "null", "-",
    ],
    { timeoutMs: AUDIO_TIMEOUT_MS, timeoutMessage: "读音轨超时" },
  );

  const samples: LoudnessSample[] = [];
  let atSec: number | null = null;
  for (const line of out.split("\n")) {
    const time = /pts_time:([0-9.]+)/.exec(line);
    if (time) {
      atSec = Number(time[1]);
      continue;
    }
    const level = /RMS_level=(-?[0-9.]+|-inf)/.exec(line);
    if (level && atSec !== null) {
      samples.push({ atSec, db: level[1] === "-inf" ? SILENCE_DB : Number(level[1]) });
      atSec = null;
    }
  }
  return samples;
}

/**
 * 把音轨读成响度序列。
 *
 * 只依赖源文件，不依赖切镜结果——所以调用方可以在写完源文件后立刻发起，
 * 让它和切镜、量结构、转写并行跑，而不是排在它们后面。
 *
 * 失败一律吞掉，返回 null：和结构量化一个规矩，
 * 节奏是 ffmpeg 算出的硬数据，不该被一个锦上添花的指标拖垮。
 */
export async function readLoudnessSafe(source: string): Promise<LoudnessSample[] | "no-audio" | null> {
  try {
    if (!(await hasAudioStream(source))) return "no-audio";
    return await readLoudness(source);
  } catch (error) {
    console.warn("[VideoFactory] 音轨没读成", {
      action: "videoFactory.benchmark.beat",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** 拿读好的响度序列算切点对齐率。纯计算，毫秒级。 */
export function beatsFrom(
  loudness: LoudnessSample[] | "no-audio" | null,
  cutsSec: number[],
  durationSec: number,
): BenchmarkBeatSync | null {
  if (loudness === null) return null;
  if (loudness === "no-audio") {
    return { alignedPct: 0, expectedPct: 0, cuts: cutsSec.length, unavailable: "no-audio" };
  }
  return measureBeatSync(cutsSec, detectOnsets(loudness), durationSec);
}
