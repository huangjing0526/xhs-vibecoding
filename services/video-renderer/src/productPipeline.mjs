/**
 * 产品展示产线：几张产品图 + 一段脚本 → 带配音和字幕的短视频。
 *
 * 流程：整段脚本 TTS → 每张图各出一段图生视频 → 全部下载 → ClipReel 把片段、字幕、
 *      音轨合成一条。
 *
 * 两家供应商可切，默认百炼 flash 档（0.1 元/秒，是硅基流动 ¥2/5 秒的四分之一）：
 * - 百炼：图片直接给 base64，不用预上传；同账号串行跑，所以逐张生成；
 * - 硅基流动：可并发，但结果 URL 只活 10 分钟，因此每张一出结果就立刻下载。
 */

import path from "node:path";
import { synthesizeToFile } from "./tts.mjs";
import { distributeSubtitles } from "./script.mjs";
import { updateJob } from "./jobs.mjs";
import { downloadTo } from "./media.mjs";
import * as bailian from "./providers/bailian.mjs";
import * as siliconflow from "./providers/siliconflow.mjs";

/** 没写画面提示时的兜底：产品展示要的是稳、清楚，不要模型自由发挥。 */
const DEFAULT_PROMPT = "镜头缓慢推近，产品主体清晰稳定，光线自然，背景干净，无文字水印";

/** 百炼按秒计费，一段固定 5 秒；用它算预估费用，也用于均分口播时长。 */
const BAILIAN_CLIP_SEC = 5;

function imageOf(item) {
  return typeof item === "string" ? item : item.image;
}

function promptOf(item, fallback) {
  const own = typeof item === "string" ? "" : item.prompt;
  return own || fallback || DEFAULT_PROMPT;
}

/**
 * 百炼：串行逐张生成。同账号同时只跑一个任务，并发只会换来限流错误。
 */
async function generateWithBailian({ job, images, prompt, outDir, resolution }) {
  const clipPaths = [];

  for (const [index, item] of images.entries()) {
    const label = `第 ${index + 1}/${images.length} 段画面`;
    updateJob(job.id, { step: index, stage: `${label}：排队生成中` });

    const taskId = await bailian.createImageToVideoTask({
      image: imageOf(item),
      prompt: promptOf(item, prompt),
      resolution,
      duration: BAILIAN_CLIP_SEC,
    });

    const { videoUrl } = await bailian.waitForTask({
      taskId,
      onTick: (status) => updateJob(job.id, { stage: `${label}：${status === "RUNNING" ? "生成中" : "排队中"}` }),
    });

    const clipPath = path.join(outDir, `${job.id}-${index}.mp4`);
    await downloadTo(videoUrl, clipPath);
    clipPaths.push(clipPath);
    updateJob(job.id, { step: index + 1 });
  }

  return clipPaths;
}

/**
 * 硅基流动：并发提交，各自等结果、各自马上下载（结果 URL 只有 10 分钟）。
 */
async function generateWithSiliconflow({ job, images, prompt, outDir, imageSize }) {
  let finished = 0;

  return Promise.all(
    images.map(async (item, index) => {
      const requestId = await siliconflow.submitImageToVideo({
        image: imageOf(item),
        prompt: promptOf(item, prompt),
        imageSize,
      });

      const videoUrl = await siliconflow.waitForVideo({
        requestId,
        onTick: () => updateJob(job.id, { stage: `正在生成画面（已完成 ${finished}/${images.length}）` }),
      });

      const clipPath = path.join(outDir, `${job.id}-${index}.mp4`);
      await downloadTo(videoUrl, clipPath);

      finished += 1;
      updateJob(job.id, { step: finished, stage: `已完成 ${finished}/${images.length} 段画面` });
      return clipPath;
    })
  );
}

export async function runProductPipeline({
  job,
  script,
  images,
  prompt,
  provider = "bailian",
  voice = "zh-CN-XiaoxiaoNeural",
  rate = "+0%",
  resolution = "720P",
  imageSize = "720x1280",
  audioDir,
  outDir,
  publicUrl,
  renderClipReel,
}) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error("至少上传一张产品图");
  }
  if (provider !== "bailian" && provider !== "siliconflow") {
    throw new Error(`未知的图生视频供应商「${provider}」`);
  }

  // key 不全就别白跑一轮配音
  (provider === "bailian" ? bailian : siliconflow).assertConfigured();

  updateJob(job.id, { totalSteps: images.length, stage: "正在合成配音" });
  const audioPath = path.join(audioDir, `${job.id}.mp3`);
  const { durationSec } = await synthesizeToFile({ text: script, voice, rate, outPath: audioPath });

  updateJob(job.id, { stage: `正在生成 ${images.length} 段画面` });
  const clipPaths =
    provider === "bailian"
      ? await generateWithBailian({ job, images, prompt, outDir, resolution })
      : await generateWithSiliconflow({ job, images, prompt, outDir, imageSize });

  updateJob(job.id, { stage: "正在合成配音与字幕" });
  const fileName = `${job.id}.mp4`;
  await renderClipReel({
    outPath: path.join(outDir, fileName),
    props: {
      slides: clipPaths.map((item) => ({ type: "video", src: `${publicUrl}/out/${path.basename(item)}` })),
      subtitles: distributeSubtitles(script, durationSec),
      audioUrl: `${publicUrl}/audio/${path.basename(audioPath)}`,
      audioDurationSec: durationSec,
      accent: "#D97732",
    },
  });

  return {
    fileName,
    durationSec,
    segments: images.length,
    resolution: provider === "bailian" ? resolution : imageSize,
    provider,
  };
}
