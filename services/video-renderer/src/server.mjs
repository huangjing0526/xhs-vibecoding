import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { synthesizeToFile } from "./tts.mjs";
import { extractVideo } from "./extract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = process.env.PORT || 8787;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

const OUT_DIR = path.join(ROOT, "out");
const AUDIO_DIR = path.join(ROOT, "audio");

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
app.use(cors());
app.use(express.json({ limit: "4mb" }));
app.use("/out", express.static(OUT_DIR));
app.use("/audio", express.static(AUDIO_DIR));

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

// 抖音/小红书拆片：下无水印视频 + ffmpeg 抽音频 + ASR 转写口播脚本。下载文件复用 /out 静态目录对外提供。
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

const server = app.listen(PORT, () => {
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
