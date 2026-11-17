import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { synthesizeToFile } from "./tts.mjs";
import { extractVideo } from "./extract.mjs";
import { createJob, failJob, getJob, updateJob } from "./jobs.mjs";
import { runAvatarPipeline } from "./avatarPipeline.mjs";
import { runHybridPipeline } from "./hybridPipeline.mjs";
import { runProductPipeline } from "./productPipeline.mjs";
import { runLocalPipeline } from "./localPipeline.mjs";
import { rendererRequestAuth } from "./requestAuth.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = process.env.PORT || 8787;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

const OUT_DIR = path.join(ROOT, "out");
const AUDIO_DIR = path.join(ROOT, "audio");
const ASSET_DIR = path.join(ROOT, "assets");

// 整个 Remotion 工程只 bundle 一次，多次渲染复用。
let bundlePromise = null;
function getBundle() {
  if (!bundlePromise) {
    bundlePromise = bundle({ entryPoint: path.join(__dirname, "index.ts") });
  }
  return bundlePromise;
}

// msedge-tts 等库可能 reject 一个字符串/对象而非 Error；统一成可读消息，避免吞错。
function normalizeError(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") {
    return /connect/i.test(error)
      ? `${error}（edge-tts 无法连接微软语音服务，请检查本机网络/代理）`
      : error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "渲染失败（未知错误）";
  }
}

async function renderComposition({ compositionId, inputProps, outPath }) {
  const serveUrl = await getBundle();
  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    audioCodec: "aac",
    outputLocation: outPath,
    inputProps,
  });
  return outPath;
}

function planToProps(plan) {
  const subtitles = (plan.scenes || []).map((scene) => scene.subtitle).filter(Boolean);
  return {
    title: plan.title || "",
    hook: plan.hook || "",
    coverText: plan.coverText || plan.hook || "",
    subtitles: subtitles.length ? subtitles : [plan.hook || plan.title || ""],
    accent: "#D97732",
  };
}

const app = express();
app.use(rendererRequestAuth());
// Remotion reads local audio and assets from its own bundle origin.
app.use((req, res, next) => ["GET", "HEAD"].includes(req.method) ? cors()(req, res, next) : next());
app.use(express.json({ limit: "32mb" }));
app.use("/out", express.static(OUT_DIR));
app.use("/audio", express.static(AUDIO_DIR));
app.use("/assets", express.static(ASSET_DIR));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/render", async (req, res) => {
  const { plan, voice, imageUrls = [], rate } = req.body || {};
  if (!plan || !plan.voiceover) {
    return res.status(400).json({ error: "缺少 plan 或 plan.voiceover" });
  }

  const safeId = String(plan.id || "video").replace(/[^a-zA-Z0-9_-]/g, "");
  const id = `${safeId}-${Date.now().toString(36)}`;

  try {
    await mkdir(OUT_DIR, { recursive: true });
    await mkdir(AUDIO_DIR, { recursive: true });

    // 1. edge-tts 配音
    const audioPath = path.join(AUDIO_DIR, `${id}.mp3`);
    const { durationSec } = await synthesizeToFile({
      text: plan.voiceover,
      voice: voice || "zh-CN-XiaoxiaoNeural",
      rate: rate || (plan.pace === "fast" ? "+18%" : "+0%"),
      outPath: audioPath,
    });

    // 2. Remotion 渲染图文快闪
    const serveUrl = await getBundle();
    const inputProps = {
      ...planToProps(plan),
      audioUrl: `${PUBLIC_URL}/audio/${id}.mp3`,
      audioDurationSec: durationSec,
      imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
    };

    const composition = await selectComposition({ serveUrl, id: "FlashCards", inputProps });
    const outputLocation = path.join(OUT_DIR, `${id}.mp4`);
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      audioCodec: "aac",
      outputLocation,
      inputProps,
    });

    return res.json({
      id,
      videoUrl: `${PUBLIC_URL}/out/${id}.mp4`,
      durationSec,
    });
  } catch (error) {
    const message = normalizeError(error);
    console.error("[video-renderer] render failed", {
      action: "video.render",
      planId: plan?.id,
      sourceType: plan?.sourceType,
      message,
    });
    return res.status(500).json({ error: message });
  }
});

/**
 * 单句配音：给一段文字返回一条 mp3 和它的真实时长。
 *
 * 视频工厂要按口播长度去定每一镜的画面长度，所以时长必须跟着音频一起回，
 * 让调用方再去量一次文件等于把 ffprobe 的依赖散到两个工程里。
 * 落盘复用 /out 静态目录，调用方按 url 取走。
 */
app.post("/tts", async (req, res) => {
  const { text, voice, rate } = req.body || {};
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "缺少 text" });
  }

  const id = `tts-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const outPath = path.join(OUT_DIR, `${id}.mp3`);
  try {
    await mkdir(OUT_DIR, { recursive: true });
    const { durationSec } = await synthesizeToFile({
      text: text.trim(),
      ...(voice ? { voice } : {}),
      ...(rate ? { rate } : {}),
      outPath,
    });
    return res.json({ url: `${PUBLIC_URL}/out/${id}.mp3`, durationSec });
  } catch (error) {
    const message = normalizeError(error);
    console.error("[video-renderer] tts failed", { action: "tts.synthesize", voice, message });
    return res.status(500).json({ error: message });
  }
});

// Run long generation pipelines asynchronously and expose progress through /jobs.
function startGenerationJob(kind, res, run) {
  const job = createJob(kind);

  // 故意不 await：请求要立刻返回。失败全部落到 failJob，不会变成未捕获的 rejection。
  (async () => {
    try {
      await mkdir(OUT_DIR, { recursive: true });
      await mkdir(AUDIO_DIR, { recursive: true });
      await mkdir(ASSET_DIR, { recursive: true });
      const result = await run(job);
      updateJob(job.id, {
        state: "done",
        stage: "已完成",
        step: job.totalSteps,
        result: { ...result, videoUrl: `${PUBLIC_URL}/out/${result.fileName}` },
      });
    } catch (error) {
      failJob(job.id, error, { kind });
    }
  })();

  return res.json({ jobId: job.id, kind, state: job.state });
}

/**
 * 数字人口播：一张形象图 + 脚本 → 百炼 wan2.2-s2v 对口型视频。
 *
 * openingSec > 0 走混合剪辑（只有开场那几秒按秒付费，后面用图铺），
 * 省九成以上；不传或传 0 才是全程出镜。默认走省钱的那条。
 */
app.post("/avatar", (req, res) => {
  const { script, image, images, openingSec = 5, voice, rate, resolution } = req.body || {};
  if (!script || !String(script).trim()) return res.status(400).json({ error: "缺少口播脚本" });
  if (!image) return res.status(400).json({ error: "缺少人物形象图" });

  const shared = {
    script,
    image,
    voice,
    rate,
    resolution,
    audioDir: AUDIO_DIR,
    assetDir: ASSET_DIR,
    outDir: OUT_DIR,
  };

  return startGenerationJob("avatar", res, (job) =>
    Number(openingSec) > 0
      ? runHybridPipeline({
          ...shared,
          job,
          sceneImages: Array.isArray(images) ? images : [],
          openingSec: Number(openingSec),
          publicUrl: PUBLIC_URL,
          renderClipReel: ({ outPath, props }) =>
            renderComposition({ compositionId: "ClipReel", inputProps: props, outPath }),
        })
      : runAvatarPipeline({ ...shared, job })
  );
});

// 产品展示：多张产品图 + 脚本 → 图生视频片段（默认百炼 flash 档）→ 配音字幕合成
app.post("/product", (req, res) => {
  const { script, images, prompt, provider, voice, rate, resolution, imageSize } = req.body || {};
  if (!script || !String(script).trim()) return res.status(400).json({ error: "缺少口播脚本" });
  if (!Array.isArray(images) || images.length === 0) return res.status(400).json({ error: "至少上传一张产品图" });

  return startGenerationJob("product", res, (job) =>
    runProductPipeline({
      job,
      script,
      images,
      prompt,
      provider,
      voice,
      rate,
      resolution,
      imageSize,
      audioDir: AUDIO_DIR,
      outDir: OUT_DIR,
      publicUrl: PUBLIC_URL,
      renderClipReel: ({ outPath, props }) =>
        renderComposition({ compositionId: "ClipReel", inputProps: props, outPath }),
    })
  );
});

// 本地合成：不调云 API，零成本，用来先把脚本和节奏跑顺
app.post("/local", (req, res) => {
  const { script, images, voice, rate } = req.body || {};
  if (!script || !String(script).trim()) return res.status(400).json({ error: "缺少口播脚本" });
  if (!Array.isArray(images) || images.length === 0) return res.status(400).json({ error: "至少上传一张图" });

  return startGenerationJob("local", res, (job) =>
    runLocalPipeline({
      job,
      script,
      images,
      voice,
      rate,
      audioDir: AUDIO_DIR,
      assetDir: ASSET_DIR,
      outDir: OUT_DIR,
      publicUrl: PUBLIC_URL,
      renderClipReel: ({ outPath, props }) =>
        renderComposition({ compositionId: "ClipReel", inputProps: props, outPath }),
    })
  );
});

app.get("/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "任务不存在或已过期" });
  return res.json(job);
});

// Keep the existing extraction contract and mainline URL normalization.
app.post("/extract", async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "缺少 url" });
  }

  const id = `extract-${Date.now().toString(36)}`;
  try {
    await mkdir(OUT_DIR, { recursive: true });
    const result = await extractVideo({ url, outDir: OUT_DIR, publicUrl: PUBLIC_URL, id });
    return res.json(result);
  } catch (error) {
    const message = normalizeError(error);
    console.error("[video-extractor] extract failed", { action: "video.extract", url, message });
    return res.status(500).json({ error: message });
  }
});

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`[video-renderer] listening on ${PUBLIC_URL}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[video-renderer] 端口 ${PORT} 已被占用——多半已有一个渲染服务在跑。\n` +
        `  · 直接用现有服务即可（无需重复启动）；\n` +
        `  · 或先停掉它再启：pkill -f "src/server.mjs"；\n` +
        `  · 或换端口：PORT=8788 npm start（记得把 app 的 VIDEO_RENDERER_URL 同步改成 http://localhost:8788）。`
    );
    process.exit(1);
  }
  console.error("[video-renderer] 启动失败", err);
  process.exit(1);
});
