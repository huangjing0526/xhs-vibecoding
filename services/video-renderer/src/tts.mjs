import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { writeFile } from "node:fs/promises";

/**
 * 用微软 Edge 免费 TTS 合成中文配音，写出 mp3，并返回时长（秒）。
 * 时长优先取 WordBoundary 元数据；拿不到时按中文 ~4.5 字/秒估算，保证画面与口播大致同步。
 */
export async function synthesizeToFile({
  text,
  voice = "zh-CN-XiaoxiaoNeural",
  rate = "+0%",
  outPath,
}) {
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

  let durationSec = lastEndTicks > 0 ? lastEndTicks / 1e7 : 0;
  if (!durationSec) {
    const chars = Array.from(text.replace(/\s+/g, "")).length;
    durationSec = Math.max(4, chars / 4.5);
  }
  return { durationSec };
}
