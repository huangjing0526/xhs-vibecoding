/**
 * 视频拆片：抖音/小红书分享链接 → yt-dlp 拉无水印视频 + 元信息 → ffmpeg 抽音频 → ASR 转写口播脚本。
 *
 * 全部依赖本地二进制（yt-dlp / ffmpeg / whisper-cli），Cloudflare Workers 跑不了，所以放在这个本地服务里。
 * ASR 可插拔：默认走本地 whisper.cpp（离线免费），没装/没配模型时可切硅基流动 API，两者都不可用则优雅降级为空脚本。
 */

import { execFile } from "node:child_process";
import { openAsBlob } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

/** 转写失败/抽音频失败时的统一降级提示，避免文案与错误归一散落多处。 */
function noteFromError(error) {
  return `口播脚本未转写：${error instanceof Error ? error.message : String(error)}`;
}

/** execFile 的 Promise 封装，统一收口 stderr，避免吞错。 */
function run(bin, args, { timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        if (error.code === "ENOENT") {
          reject(new Error(`未找到命令 ${bin}，请先安装（抖音拆片需要 yt-dlp 与 ffmpeg：brew install yt-dlp ffmpeg）`));
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

/**
 * 抖音/小红书需要浏览器 cookie（哪怕未登录）才不报「Fresh cookies needed」。
 * 支持从本地浏览器直接读（YTDLP_COOKIES_FROM_BROWSER=chrome/safari/…）或指定 cookies.txt。
 */
function ytdlpCookieArgs() {
  const fromBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (fromBrowser) return ["--cookies-from-browser", fromBrowser];
  const cookiesFile = process.env.YTDLP_COOKIES_FILE?.trim();
  if (cookiesFile) return ["--cookies", cookiesFile];
  return [];
}

function detectPlatform(url, extractorKey) {
  const key = (extractorKey || "").toLowerCase();
  if (key.includes("douyin") || /douyin\.com|iesdouyin\.com/i.test(url)) return "douyin";
  if (key.includes("xiaohongshu") || key.includes("redbook") || /xiaohongshu\.com|xhslink\.com/i.test(url)) {
    return "xiaohongshu";
  }
  return "unknown";
}

/**
 * yt-dlp 一次调用：下载无水印视频到 outDir 并打印元信息 JSON。
 * @returns {{ info: object, videoPath: string }}
 */
async function downloadVideo(url, outDir, id) {
  const outTemplate = path.join(outDir, `${id}.%(ext)s`);
  const { stdout } = await run("yt-dlp", [
    "--no-warnings",
    "--no-playlist",
    ...ytdlpCookieArgs(),
    "--merge-output-format",
    "mp4",
    "-o",
    outTemplate,
    "--print-json",
    url,
  ]);
  // --print-json 下载完成后把 info json 打到 stdout（可能多行，取最后一个 JSON 对象）。
  const line = stdout.trim().split("\n").filter(Boolean).pop() || "{}";
  const info = JSON.parse(line);
  const videoPath =
    info.requested_downloads?.[0]?.filepath || info._filename || path.join(outDir, `${id}.mp4`);
  return { info, videoPath };
}

/** ffmpeg 抽成 16kHz 单声道 wav（whisper 的最佳输入）。 */
async function extractAudio(videoPath, outDir, id) {
  const wavPath = path.join(outDir, `${id}.wav`);
  await run("ffmpeg", ["-y", "-i", videoPath, "-vn", "-ar", "16000", "-ac", "1", wavPath]);
  return wavPath;
}

/** 本地 whisper.cpp 转写。缺模型/未装则抛错，交上层降级。 */
async function transcribeWhisperCpp(wavPath, outDir, id) {
  const bin = process.env.WHISPER_BIN || "whisper-cli";
  const model = process.env.WHISPER_MODEL;
  if (!model) {
    throw new Error("未配置 WHISPER_MODEL（whisper.cpp 模型路径），无法本地转写");
  }
  const prefix = path.join(outDir, `${id}`);
  await run(bin, [
    "-m",
    model,
    "-f",
    wavPath,
    "-l",
    process.env.WHISPER_LANG || "zh",
    "-oj",
    "-of",
    prefix,
    "--no-prints",
  ]);
  const json = JSON.parse(await readFile(`${prefix}.json`, "utf8"));
  const segments = json.transcription || [];
  const text = segments.map((seg) => (seg.text || "").trim()).filter(Boolean).join("");
  await rm(`${prefix}.json`, { force: true });
  return text;
}

/** 硅基流动 SenseVoice 转写（API 兜底）。 */
async function transcribeSiliconflow(wavPath) {
  const apiKey = process.env.ASR_API_KEY || process.env.SILICONFLOW_API_KEY;
  if (!apiKey) throw new Error("未配置 ASR_API_KEY / SILICONFLOW_API_KEY，无法调用 API 转写");
  const model = process.env.ASR_MODEL || "FunAudioLLM/SenseVoiceSmall";
  const base = process.env.ASR_API_BASE || "https://api.siliconflow.cn/v1";

  const form = new FormData();
  // 直接从文件构造 Blob，避免把整段 wav 先读进 Buffer 再拷一份。
  form.append("file", await openAsBlob(wavPath, { type: "audio/wav" }), path.basename(wavPath));
  form.append("model", model);

  const resp = await fetch(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`ASR API 转写失败（${resp.status}）${detail ? `：${detail.slice(0, 200)}` : ""}`);
  }
  const data = await resp.json();
  return (data.text || "").trim();
}

/** 按 ASR_PROVIDER 选转写实现，失败不抛断整条链路，只回空脚本 + 原因提示。 */
async function transcribe(wavPath, outDir, id) {
  const provider = (process.env.ASR_PROVIDER || "whisper-cpp").toLowerCase();
  try {
    const text =
      provider === "siliconflow" || provider === "api"
        ? await transcribeSiliconflow(wavPath)
        : await transcribeWhisperCpp(wavPath, outDir, id);
    return { transcript: text, transcriptNote: text ? "" : "ASR 返回空，视频可能没有人声" };
  } catch (error) {
    console.error("[video-extractor] 转写失败，降级为空脚本", {
      action: "video.extract.asr",
      provider,
      message: error instanceof Error ? error.message : String(error),
    });
    return { transcript: "", transcriptNote: noteFromError(error) };
  }
}

/**
 * 拆片主流程。
 * @param {{ url: string, outDir: string, publicUrl: string, id: string }} opts
 */
export async function extractVideo({ url, outDir, publicUrl, id }) {
  const { info, videoPath } = await downloadVideo(url, outDir, id);
  const platform = detectPlatform(url, info.extractor_key);

  let transcript = "";
  let transcriptNote = "";
  let wavPath = "";
  try {
    wavPath = await extractAudio(videoPath, outDir, id);
    ({ transcript, transcriptNote } = await transcribe(wavPath, outDir, id));
  } catch (error) {
    console.error("[video-extractor] 抽音频失败，降级为空脚本", {
      action: "video.extract.audio",
      message: error instanceof Error ? error.message : String(error),
    });
    transcriptNote = noteFromError(error);
  } finally {
    if (wavPath) await rm(wavPath, { force: true });
  }

  return {
    platform,
    title: info.title || info.fulltitle || "",
    desc: info.description || "",
    author: info.uploader || info.uploader_id || info.channel || "",
    durationSec: Math.round(info.duration || 0),
    coverUrl: info.thumbnail || "",
    videoUrl: `${publicUrl}/out/${path.basename(videoPath)}`,
    transcript,
    transcriptNote,
  };
}
