/**
 * 本地合成产线：图 + 脚本 → 配音、字幕、缓慢推近的成片。**不调任何云 API，零成本。**
 *
 * 定位是「先跑一遍再决定花不花钱」：生视频一条几十块、还要等十几分钟，脚本和节奏
 * 却往往要改好几版。先用这条把内容定下来，满意了再去跑对口型版，省下的是真金白银。
 *
 * 代价说清楚：画面是静态图，人物嘴不会动。要对口型只能走数字人那条。
 */

import path from "node:path";
import { synthesizeToFile } from "./tts.mjs";
import { distributeSubtitles } from "./script.mjs";
import { writeDataUrl } from "./media.mjs";
import { updateJob } from "./jobs.mjs";

export async function runLocalPipeline({
  job,
  script,
  images,
  voice = "zh-CN-XiaoxiaoNeural",
  rate = "+0%",
  audioDir,
  assetDir,
  outDir,
  publicUrl,
  renderClipReel,
}) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error("至少上传一张图");
  }

  updateJob(job.id, { totalSteps: 2, step: 0, stage: "正在合成配音" });
  const audioPath = path.join(audioDir, `${job.id}.mp3`);
  const { durationSec } = await synthesizeToFile({ text: script, voice, rate, outPath: audioPath });

  // Remotion 通过 HTTP 取素材，所以图片要落到静态目录，不能直接塞 data URL（几 MB 的
  // base64 进 inputProps 会把 bundle 参数撑爆）
  updateJob(job.id, { step: 1, stage: "正在准备画面" });
  const slides = [];
  for (const [index, image] of images.entries()) {
    const { fileName } = await writeDataUrl(image, assetDir, `${job.id}-${index}`);
    slides.push({ type: "image", src: `${publicUrl}/assets/${fileName}` });
  }

  updateJob(job.id, { stage: "正在合成成片" });
  const fileName = `${job.id}.mp4`;
  await renderClipReel({
    outPath: path.join(outDir, fileName),
    props: {
      slides,
      subtitles: distributeSubtitles(script, durationSec),
      audioUrl: `${publicUrl}/audio/${path.basename(audioPath)}`,
      audioDurationSec: durationSec,
      accent: "#D97732",
    },
  });

  return { fileName, durationSec, segments: slides.length, resolution: "1080x1920" };
}
