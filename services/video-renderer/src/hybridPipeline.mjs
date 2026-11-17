/**
 * 混合剪辑：开场几秒真人对口型，后面切画面图，配音全程连续。
 *
 * **这是成本的主要杠杆**：数字人按秒计费（480P 0.5 元/秒），一条 60 秒全程出镜要 ¥30；
 * 只让开场 5 秒出镜、后面用图铺，就是 ¥2.5，降九成以上。
 * 而且这本来就是短视频的正常剪法——开头露脸建立人设，之后切素材，
 * 全程盯着一个人念 60 秒反而不像正经剪辑。
 *
 * 流程：脚本切成「开场 / 其余」→ 各自 TTS → 开场那段跑 s2v 出对口型片段 →
 *      两段音频拼成整条 → ClipReel 把「数字人片段 + 画面图」按显式时长排到这条音轨上。
 *
 * 对口型能对上的前提：开场片段在成片里占的时长，必须严格等于开场那段配音的时长。
 * 所以这里给 slide 显式 durationSec，而不是让 ClipReel 平分。
 */

import path from "node:path";
import { probeDurationSec, synthesizeToFile } from "./tts.mjs";
import { distributeSubtitles, splitScriptForHybrid } from "./script.mjs";
import { concatAudio, downloadTo, writeDataUrl } from "./media.mjs";
import { updateJob } from "./jobs.mjs";
import {
  assertConfigured,
  createAvatarTask,
  uploadToTemporaryStorage,
  waitForTask,
  S2V_MAX_AUDIO_SEC,
  S2V_MODEL,
} from "./providers/bailian.mjs";

export async function runHybridPipeline({
  job,
  script,
  image,
  sceneImages = [],
  openingSec = 5,
  voice = "zh-CN-XiaoxiaoNeural",
  rate = "+0%",
  resolution = "480P",
  audioDir,
  assetDir,
  outDir,
  publicUrl,
  renderClipReel,
}) {
  assertConfigured();

  // 1. 切开场与其余，各自配音。分开合成而不是整段合成后裁剪：裁剪的切点会落在字中间。
  updateJob(job.id, { totalSteps: 3, step: 0, stage: "正在合成配音" });
  const { opening, rest } = splitScriptForHybrid(script, openingSec);

  const openingAudio = path.join(audioDir, `${job.id}-opening.mp3`);
  await synthesizeToFile({
    text: opening,
    voice,
    rate,
    outPath: openingAudio,
  });

  let openingDuration;
  try {
    openingDuration = await probeDurationSec(openingAudio);
  } catch (error) {
    console.error("[video-gen] Opening duration measurement failed", {
      userId: "local", tenantId: "local", action: "video.hybrid.openingDuration",
      jobId: job.id, openingSec, error,
    });
    throw new Error("无法测量开场配音的实际时长，尚未提交付费生成。请检查 ffprobe 后重试。");
  }

  if (!(openingDuration > 0 && openingDuration <= Math.min(openingSec, S2V_MAX_AUDIO_SEC))) {
    console.error("[video-gen] Opening duration outside selected bound", {
      userId: "local", tenantId: "local", action: "video.hybrid.openingDuration",
      jobId: job.id, openingSec, openingDuration, providerMaxSec: S2V_MAX_AUDIO_SEC,
    });
    throw new Error(
      `开场配音实测 ${Number.isFinite(openingDuration) ? openingDuration.toFixed(1) : "未知"} 秒，未满足所选 ${openingSec} 秒开场范围（平台单次上限 ${S2V_MAX_AUDIO_SEC} 秒）。` +
        "尚未提交付费生成，请缩短开场或选择更长的出镜方式后重试。"
    );
  }

  const audioPaths = [openingAudio];
  let totalDuration = openingDuration;
  // 字幕按段分配：开场那几句只能占开场那几秒，否则字幕会跑到配音前面去
  const subtitles = distributeSubtitles(opening, openingDuration);

  if (rest) {
    const restAudio = path.join(audioDir, `${job.id}-rest.mp3`);
    const { durationSec } = await synthesizeToFile({ text: rest, voice, rate, outPath: restAudio });
    audioPaths.push(restAudio);
    totalDuration += durationSec;
    subtitles.push(...distributeSubtitles(rest, durationSec));
  }

  // 2. 只有开场这一段花钱
  updateJob(job.id, {
    step: 1,
    stage: `开场 ${openingDuration.toFixed(1)} 秒出镜生成中（约 5-10 分钟）`,
  });

  const portrait = await writeDataUrl(image, assetDir, `${job.id}-portrait`);
  const imageUrl = await uploadToTemporaryStorage({
    filePath: portrait.filePath,
    fileName: portrait.fileName,
    model: S2V_MODEL,
  });
  const audioUrl = await uploadToTemporaryStorage({
    filePath: openingAudio,
    fileName: path.basename(openingAudio),
    model: S2V_MODEL,
  });

  const taskId = await createAvatarTask({ imageUrl, audioUrl, resolution });
  const { videoUrl } = await waitForTask({
    taskId,
    onTick: (status) =>
      updateJob(job.id, { stage: `开场出镜${status === "RUNNING" ? "生成中" : "排队中"}（约 5-10 分钟）` }),
  });

  const avatarClip = path.join(outDir, `${job.id}-opening.mp4`);
  await downloadTo(videoUrl, avatarClip);

  // 3. 排片：开场片段占死它那段配音的时长，其余画面平分剩下的
  updateJob(job.id, { step: 2, stage: "正在合成整条成片" });

  const slides = [
    {
      type: "video",
      src: `${publicUrl}/out/${path.basename(avatarClip)}`,
      durationSec: openingDuration,
    },
  ];

  for (const [index, sceneImage] of sceneImages.entries()) {
    const { fileName } = await writeDataUrl(sceneImage, assetDir, `${job.id}-scene-${index}`);
    slides.push({ type: "image", src: `${publicUrl}/assets/${fileName}` });
  }

  // 没传画面图时用形象图兜底：画面会定住，但至少不是黑屏，且用户下次知道该补图
  if (slides.length === 1 && rest) {
    slides.push({ type: "image", src: `${publicUrl}/assets/${portrait.fileName}` });
  }

  const masterAudio = await concatAudio(audioPaths, path.join(audioDir, `${job.id}.mp3`), audioDir);

  const fileName = `${job.id}.mp4`;
  await renderClipReel({
    outPath: path.join(outDir, fileName),
    props: {
      slides,
      subtitles,
      audioUrl: `${publicUrl}/audio/${path.basename(masterAudio)}`,
      audioDurationSec: totalDuration,
      accent: "#D97732",
    },
  });

  return {
    fileName,
    durationSec: totalDuration,
    segments: slides.length,
    resolution,
    /** 实际按秒计费的只有开场这一段，回给前端对账 */
    billedSec: Number(openingDuration.toFixed(1)),
  };
}
