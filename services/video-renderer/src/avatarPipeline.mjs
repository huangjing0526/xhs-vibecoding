/**
 * 数字人口播产线：一张形象图 + 一段脚本 → 对口型口播视频。
 *
 * 用户只提供图和文字，配音由 edge-tts 出（免费、无需录音），这是这条链路能「足够简单」的关键。
 *
 * 流程：脚本切段（≤19 秒/段）→ 逐段 TTS → 图与音频传百炼临时空间 → 逐段 s2v →
 *      下载各段 → ffmpeg 拼成一条。
 *
 * 为什么是串行：百炼同账号同时只允许 1 个任务在跑，并发提交只会换来一串限流错误。
 */

import path from "node:path";
import { synthesizeToFile } from "./tts.mjs";
import { splitScriptForAvatar } from "./script.mjs";
import { writeDataUrl, concatVideos, downloadTo } from "./media.mjs";
import { updateJob } from "./jobs.mjs";
import {
  assertConfigured,
  createAvatarTask,
  uploadToTemporaryStorage,
  waitForTask,
  S2V_MAX_AUDIO_SEC,
  S2V_MODEL,
} from "./providers/bailian.mjs";

/**
 * TTS 出来的真实时长可能超过按字数的估算。超了就把这段对半劈开重合成，
 * 而不是硬着头皮送去被平台拒——递归深度给到 3 层，够覆盖任何正常口播句子。
 */
async function synthesizeWithinLimit({ text, voice, rate, dir, baseName, depth = 0 }) {
  const outPath = path.join(dir, `${baseName}.mp3`);
  const { durationSec } = await synthesizeToFile({ text, voice, rate, outPath });

  if (durationSec <= S2V_MAX_AUDIO_SEC || depth >= 3) {
    if (durationSec > S2V_MAX_AUDIO_SEC) {
      throw new Error(
        `有一句话的配音长达 ${durationSec.toFixed(1)} 秒，超过平台 ${S2V_MAX_AUDIO_SEC} 秒上限且无法再切，请把这句改短`
      );
    }
    return [{ text, audioPath: outPath, durationSec }];
  }

  const chars = Array.from(text);
  const mid = Math.ceil(chars.length / 2);
  const left = await synthesizeWithinLimit({
    text: chars.slice(0, mid).join(""),
    voice,
    rate,
    dir,
    baseName: `${baseName}a`,
    depth: depth + 1,
  });
  const right = await synthesizeWithinLimit({
    text: chars.slice(mid).join(""),
    voice,
    rate,
    dir,
    baseName: `${baseName}b`,
    depth: depth + 1,
  });
  return [...left, ...right];
}

export async function runAvatarPipeline({
  job,
  script,
  image,
  voice = "zh-CN-XiaoxiaoNeural",
  rate = "+0%",
  resolution = "480P",
  audioDir,
  assetDir,
  outDir,
}) {
  assertConfigured();
  updateJob(job.id, { stage: "正在合成配音" });

  // 1. 切段 + 逐段配音。先把音频全部备齐，才知道总共几段、要花多少钱。
  const rawSegments = splitScriptForAvatar(script, S2V_MAX_AUDIO_SEC);
  const segments = [];
  for (const [index, text] of rawSegments.entries()) {
    const parts = await synthesizeWithinLimit({
      text,
      voice,
      rate,
      dir: audioDir,
      baseName: `${job.id}-${index}`,
    });
    segments.push(...parts);
  }

  const totalAudioSec = segments.reduce((sum, item) => sum + item.durationSec, 0);
  updateJob(job.id, {
    totalSteps: segments.length,
    stage: `配音完成，共 ${segments.length} 段 / ${totalAudioSec.toFixed(1)} 秒`,
  });

  // 2. 形象图只需上传一次，各段复用同一张
  updateJob(job.id, { stage: "正在上传形象图" });
  const { filePath, fileName } = await writeDataUrl(image, assetDir, `${job.id}-portrait`);
  const imageUrl = await uploadToTemporaryStorage({ filePath, fileName, model: S2V_MODEL });

  // 3. 逐段生成。每段都是「上传音频 → 建任务 → 等结果 → 立刻下载」，
  //    结果 URL 有有效期，等全部跑完再下载会取不到。
  const clipPaths = [];
  for (const [index, segment] of segments.entries()) {
    const label = `第 ${index + 1}/${segments.length} 段`;
    updateJob(job.id, { step: index, stage: `${label}：上传配音` });

    const audioUrl = await uploadToTemporaryStorage({
      filePath: segment.audioPath,
      fileName: path.basename(segment.audioPath),
      model: S2V_MODEL,
    });

    updateJob(job.id, { stage: `${label}：排队生成中（单段约 5-10 分钟）` });
    const taskId = await createAvatarTask({ imageUrl, audioUrl, resolution });

    const { videoUrl } = await waitForTask({
      taskId,
      onTick: (status) => updateJob(job.id, { stage: `${label}：${status === "RUNNING" ? "生成中" : "排队中"}` }),
    });

    const clipPath = path.join(outDir, `${job.id}-${index}.mp4`);
    updateJob(job.id, { stage: `${label}：下载中` });
    await downloadTo(videoUrl, clipPath);
    clipPaths.push(clipPath);
    updateJob(job.id, { step: index + 1 });
  }

  // 4. 多段拼成一条
  updateJob(job.id, { stage: segments.length > 1 ? "正在拼接成片" : "正在收尾" });
  const finalPath = path.join(outDir, `${job.id}.mp4`);
  const resultPath = await concatVideos(clipPaths, finalPath, outDir);

  return {
    fileName: path.basename(resultPath),
    durationSec: totalAudioSec,
    segments: segments.length,
    resolution,
  };
}
