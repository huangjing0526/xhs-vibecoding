import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/**
 * 中文配音合成，写出 mp3 并返回时长（秒）。
 *
 * 两条通道，形状一致，按顺序试：
 * 1. edge-cli —— 本机装的 Python `edge-tts`，走微软 Edge 的免费神经语音
 * 2. msedge   —— Node 的 msedge-tts 库，同一批音色的另一种实现
 *
 * 之所以两条都留着：这两个客户端跟微软服务的握手方式不同，会各自失效。
 * 实测有过 msedge-tts 直接 Connect Error、而 Python edge-tts 正常出声的情况，
 * 只留一条的话，配音这个功能就会随着某一个客户端过时而整体失灵。
 */

/** 首选通道。TTS_PROVIDER 只表达偏好——它失败了照样往下试，别让一个环境变量把配音写死。 */
const PROVIDER_ORDER = ["edge-cli", "msedge"];

function execFileAsync(bin, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        if (error.code === "ENOENT") {
          reject(new Error(`未找到命令 ${bin}，请先安装（pip install edge-tts），或用 TTS_EDGE_BIN 指定路径`));
          return;
        }
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/** 量出 mp3 的真实时长。比按字数估准得多，画面按它对齐口播才不会飘。 */
async function probeDurationSec(filePath) {
  const { stdout } = await execFileAsync(
    process.env.FFPROBE_BIN || "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath],
    30000,
  );
  const value = Number(String(stdout).trim());
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** 中文按 ~4.5 字/秒估时长。两条通道都量不出真实时长时才用它兜底。 */
function estimateDurationSec(text) {
  const chars = Array.from(text.replace(/\s+/g, "")).length;
  return Math.max(4, chars / 4.5);
}

/** 通道一：Python edge-tts CLI。时长直接量文件，不依赖元数据。 */
async function synthesizeEdgeCli({ text, voice, rate, outPath }) {
  await execFileAsync(process.env.TTS_EDGE_BIN || "edge-tts", [
    "--voice", voice,
    "--rate", rate,
    "--text", text,
    "--write-media", outPath,
  ]);
  return { durationSec: (await probeDurationSec(outPath)) || estimateDurationSec(text) };
}

/** 通道二：Node msedge-tts 库。时长优先取 WordBoundary 元数据。 */
async function synthesizeMsEdge({ text, voice, rate, outPath }) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  // 不同 msedge-tts 版本 toStream 形态不同：可能返回 {audioStream, metadataStream} 或单 Readable。
  let result;
  try {
    result = tts.toStream(text, { rate });
  } catch {
    result = tts.toStream(text);
  }
  const audioStream = result?.audioStream || result;
  const metadataStream = result?.metadataStream || null;

  const chunks = [];
  let lastEndTicks = 0;

  if (metadataStream) {
    metadataStream.on("data", (data) => {
      try {
        const meta = typeof data === "string" ? JSON.parse(data) : data;
        for (const item of meta?.Metadata || []) {
          const offset = item?.Data?.Offset ?? 0;
          const duration = item?.Data?.Duration ?? 0;
          lastEndTicks = Math.max(lastEndTicks, offset + duration);
        }
      } catch {
        // 单个元数据分片解析失败不影响音频，忽略
      }
    });
  }

  await new Promise((resolve, reject) => {
    audioStream.on("data", (chunk) => chunks.push(chunk));
    audioStream.on("end", resolve);
    audioStream.on("close", resolve);
    audioStream.on("error", reject);
  });

  await writeFile(outPath, Buffer.concat(chunks));
  return { durationSec: lastEndTicks > 0 ? lastEndTicks / 1e7 : estimateDurationSec(text) };
}

const SYNTHESIZERS = { "edge-cli": synthesizeEdgeCli, msedge: synthesizeMsEdge };

export async function synthesizeToFile({
  text,
  voice = "zh-CN-XiaoxiaoNeural",
  rate = "+0%",
  outPath,
}) {
  const preferred = (process.env.TTS_PROVIDER || "").toLowerCase();
  const order = SYNTHESIZERS[preferred]
    ? [preferred, ...PROVIDER_ORDER.filter((id) => id !== preferred)]
    : PROVIDER_ORDER;

  const failures = [];
  for (const id of order) {
    try {
      return await SYNTHESIZERS[id]({ text, voice, rate, outPath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${id}：${message}`);
      // 还有通道可试，所以这里不抛；但失败原因必须留痕，否则永远查不出是哪条挂了
      console.error("[video-renderer] TTS 通道失败，尝试下一条", {
        action: "tts.synthesize",
        provider: id,
        voice,
        message,
      });
    }
  }
  throw new Error(`所有 TTS 通道都失败了 —— ${failures.join("；")}`);
}
