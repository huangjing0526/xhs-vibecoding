/**
 * 把原片的口播按镜头边界切开：哪一镜说了哪句话。
 *
 * 为什么这条线要自己转写，而不是复用 /api/video/extract 的结果：
 * 那条线返回的是整片一段纯文本，时间戳在服务里被 join 掉了。
 * 而这里要的恰恰是时间戳——走编辑通道换掉主体之后，口型还是原片说原话时的口型，
 * 要补对口型就得知道这一镜原本说的是哪句、占了哪几秒。
 *
 * 转写只是读，原声不进下游：成片的口播是自己配的，这里拿到的只有文字和时间码。
 */

import { access, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { runCommand } from "@/app/api/video-factory/_shared";
import type { BenchmarkShot, BenchmarkShotVoiceover } from "@/lib/videoFactory";

const ASR_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 没配 WHISPER_MODEL 时试这几个地方。
 * 都是本机已经为别的用途下过的模型，能省一次几百兆的下载；
 * 一个都没有就干脆不转写，而不是去下一个——拆片不该在这一步卡住几分钟。
 */
const MODEL_FALLBACKS = [
  path.join(homedir(), "workspace", "tools", "models", "whisper", "ggml-small.bin"),
  path.join(homedir(), ".cache", "hyperframes", "whisper", "models", "ggml-small.bin"),
];

async function findModel(): Promise<string | null> {
  const configured = process.env.WHISPER_MODEL;
  if (configured) return configured;
  for (const candidate of MODEL_FALLBACKS) {
    if (await access(candidate).then(() => true, () => false)) return candidate;
  }
  return null;
}

/** whisper.cpp 的 -oj 输出，只取用得上的那两样。 */
interface WhisperSegment {
  offsets?: { from?: number; to?: number };
  text?: string;
}

export interface TranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
}

/**
 * 整片转写成带时间码的段落。没装模型就返回空，不报错——
 * 和结构量化、节拍对齐一个规矩：缺了只是少一项，不能把整条拆解拖垮。
 */
export async function transcribe(source: string, workDir: string): Promise<TranscriptSegment[]> {
  const model = await findModel();
  if (!model) {
    console.info("[VideoFactory] 没有 whisper 模型，跳过转写", {
      action: "videoFactory.benchmark.asr",
      hint: "配 WHISPER_MODEL 指向 ggml 模型文件即可开启",
    });
    return [];
  }

  const wav = path.join(workDir, "asr.wav");
  const prefix = path.join(workDir, "asr");
  try {
    // 16k 单声道是 whisper 的最佳输入，别的采样率它内部还要再重采一次
    await runCommand("ffmpeg", ["-y", "-v", "error", "-i", source, "-vn", "-ar", "16000", "-ac", "1", wav], {
      timeoutMs: ASR_TIMEOUT_MS,
      timeoutMessage: "抽音轨超时",
    });
    await runCommand(
      process.env.WHISPER_BIN || "whisper-cli",
      ["-m", model, "-f", wav, "-l", process.env.WHISPER_LANG || "zh", "-oj", "-of", prefix, "--no-prints"],
      { timeoutMs: ASR_TIMEOUT_MS, timeoutMessage: "转写超时，换个小一点的模型" },
    );
    const parsed = JSON.parse(await readFile(`${prefix}.json`, "utf8")) as { transcription?: WhisperSegment[] };
    return (parsed.transcription || [])
      .map((segment) => ({
        startSec: (segment.offsets?.from ?? 0) / 1000,
        endSec: (segment.offsets?.to ?? 0) / 1000,
        text: (segment.text || "").trim(),
      }))
      .filter((segment) => segment.text);
  } catch (error) {
    console.warn("[VideoFactory] 转写失败，这条片子没有逐镜口播", {
      action: "videoFactory.benchmark.asr",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  } finally {
    // 音轨读完就丢，不留在模板目录里——原声不进下游这条要落到磁盘上，不只是嘴上说
    await rm(wav, { force: true }).catch(() => {});
    await rm(`${prefix}.json`, { force: true }).catch(() => {});
  }
}

/**
 * 把转写段落分配到镜头。
 *
 * 按段落中点归属，不按起点：一句话常常跨过切点，起点在上一镜、大半句在下一镜，
 * 按起点分会把整句挂到只露了半个字的那一镜上。
 * 一镜里的多段直接接起来，中间不加空格——中文口播断句本来就没有空格。
 */
export function assignVoiceovers(
  shots: BenchmarkShot[],
  segments: TranscriptSegment[],
): Map<number, BenchmarkShotVoiceover> {
  const out = new Map<number, BenchmarkShotVoiceover>();
  for (const segment of segments) {
    const middle = (segment.startSec + segment.endSec) / 2;
    const shot = shots.find((item) => middle >= item.startSec && middle < item.endSec);
    if (!shot) continue;
    const existing = out.get(shot.order);
    out.set(shot.order, {
      text: existing ? existing.text + segment.text : segment.text,
      startSec: existing ? existing.startSec : segment.startSec,
      endSec: segment.endSec,
    });
  }
  return out;
}
