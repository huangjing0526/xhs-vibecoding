import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { serveVideoFile } from "@/app/api/video-factory/_serveVideo";
import { renderSubtitlePng } from "@/app/api/video-factory/_subtitleImage";
import {
  RENDERER_URL,
  finalCutPath,
  isSafeSegment,
  projectDir,
  readProject,
  runCommand,
  voiceoverPath,
  writeProject,
} from "@/app/api/video-factory/_shared";
import {
  DEFAULT_VOICE,
  DEFAULT_VOICE_RATE,
  VOICEOVER_TAIL_SEC,
  type FinalCut,
  type Shot,
  type ShotVoiceover,
  type VideoProject,
} from "@/lib/videoFactory";

// 跑本机 ffmpeg、调本机配音服务，必须 nodejs runtime。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * 成片统一规格。
 * 各镜的原始产出分辨率并不一致（grok 出的是 720x1264 这种奇数高），
 * 而 concat 要求所有片段编码参数完全一样，所以合成时一律先归一到这个规格。
 */
const OUT_WIDTH = 720;
const OUT_HEIGHT = 1280;
const OUT_FPS = 30;

/**
 * 像素格式必须显式钉成 yuv420p。
 * 叠字幕用的是带 alpha 的 PNG，overlay 会顺势把色度采样提到 4:4:4，
 * x264 于是编出 High 4:4:4 Predictive —— 播放器能开，但浏览器一律解不了，
 * 表现是 <video> 点了播放永远停在 0:00。
 */
const OUT_PIX_FMT = "yuv420p";

/** 各镜自带的环境音压到这个量级垫在口播下面——留着有临场感，不压会盖住人声。 */
const AMBIENT_DB = -22;

/**
 * 混音前给口播加的增益。
 * amix 会按输入路数均分音量，两路进去人声就只剩一半，
 * 不补这一下成片整体会闷掉（实测均值会低到 -30dB 上下）。
 */
const VOICE_GAIN = 1.9;

const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

const run = (args: string[]) =>
  runCommand("ffmpeg", ["-nostdin", "-v", "error", "-y", ...args], {
    timeoutMs: COMMAND_TIMEOUT_MS,
    timeoutMessage: "ffmpeg 合成超时，镜头数太多或机器太忙",
  });

async function probeDurationSec(file: string): Promise<number> {
  const out = await runCommand(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { timeoutMs: 30_000 },
  );
  const value = Number(String(out).trim().split("\n")[0]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

interface ComposeRequest {
  projectId?: string;
  withSubtitles?: boolean;
  withVoiceover?: boolean;
  voice?: string;
  rate?: string;
}

/**
 * 取一镜的配音：口播原文没变就直接用盘上那条，变了才重配。
 * 每次合成都全量重配的话，改一个字就要等五次网络往返。
 */
async function ensureVoiceover(
  project: VideoProject,
  shot: Shot,
  voice: string,
  rate: string,
): Promise<ShotVoiceover> {
  const text = (shot.voiceover || "").trim();
  const cached = project.voiceovers.find((item) => item.shotOrder === shot.order);
  if (cached && cached.text === text && cached.voice === voice && cached.rate === rate) {
    const onDisk = await stat(cached.path).then((info) => info.isFile(), () => false);
    if (onDisk) return cached;
  }

  const response = await fetch(`${RENDERER_URL}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, rate }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`第 ${shot.order} 镜配音失败（${response.status}）${detail ? `：${detail.slice(0, 200)}` : ""}`);
  }
  const data = (await response.json()) as { url?: string; durationSec?: number };
  if (!data.url) throw new Error(`第 ${shot.order} 镜配音服务没返回音频地址`);

  const audio = await fetch(data.url);
  if (!audio.ok) throw new Error(`第 ${shot.order} 镜配音下载失败（${audio.status}）`);
  const target = voiceoverPath(project.id, shot.order);
  await writeFile(target, Buffer.from(await audio.arrayBuffer()));

  return {
    shotOrder: shot.order,
    text,
    path: target,
    // 服务端量过一次就别再量：两边用的是同一个 ffprobe，算出来只会一样
    durationSec: Number(data.durationSec) > 0 ? Number(data.durationSec) : await probeDurationSec(target),
    voice,
    rate,
    createdAt: new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  let projectId = "";
  try {
    const body = await readJsonBody<ComposeRequest>(request, "videoFactory.compose.readJson");
    projectId = String(body.projectId || "").trim();
    if (!isSafeSegment(projectId)) return apiBadRequest("项目 id 不合法");

    const project = await readProject(projectId);
    if (!project) return apiBadRequest("项目不存在");
    const shots = project.storyboard?.shots || [];
    if (shots.length === 0) return apiBadRequest("还没有分镜表，先去拆分镜");

    const withSubtitles = body.withSubtitles !== false;
    const withVoiceover = body.withVoiceover !== false;
    const voice = String(body.voice || DEFAULT_VOICE).trim();
    const rate = String(body.rate || DEFAULT_VOICE_RATE).trim();

    // 缺片子的镜头一次报全，别做到一半才停——要的是「还差哪几镜」，不是第一个错误
    const missing = shots
      .filter((shot) => !project.clips.some((clip) => clip.shotOrder === shot.order))
      .map((shot) => shot.order);
    if (missing.length > 0) {
      return apiBadRequest(`第 ${missing.join("、")} 镜还没有成片，先把它们生成出来`);
    }

    const dir = projectDir(projectId);
    const workDir = path.join(dir, "compose");
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true });

    const voiceovers: ShotVoiceover[] = [];
    const extendedShots: FinalCut["extendedShots"] = [];
    const partFiles: string[] = [];
    const tooShort: string[] = [];

    for (const shot of shots) {
      const clip = project.clips.find((item) => item.shotOrder === shot.order)!;
      const clipSec = (await probeDurationSec(clip.videoPath)) || clip.durationSec;

      // 对标节奏给的计划时长
      const plannedSec = shot.trimToSec ?? shot.durationSec;

      let voiceover: ShotVoiceover | null = null;
      let neededSec = plannedSec;
      if (withVoiceover && (shot.voiceover || "").trim()) {
        voiceover = await ensureVoiceover(project, shot, voice, rate);
        voiceovers.push(voiceover);
        // 口播说不完的镜头是废镜头，所以口播长度是下限，对标节奏只能让步
        neededSec = Math.max(plannedSec, voiceover.durationSec + VOICEOVER_TAIL_SEC);
      }

      if (neededSec > clipSec + 0.05) {
        tooShort.push(`第 ${shot.order} 镜要 ${neededSec.toFixed(1)}s，片子只有 ${clipSec.toFixed(1)}s`);
        continue;
      }
      if (neededSec > plannedSec + 0.01) {
        extendedShots.push({
          shotOrder: shot.order,
          plannedSec: Number(plannedSec.toFixed(2)),
          actualSec: Number(neededSec.toFixed(2)),
        });
      }

      const cut = neededSec.toFixed(3);
      const stem = String(shot.order).padStart(2, "0");
      const basePart = path.join(workDir, `base-${stem}.mp4`);

      // ① 剪到目标长度 + 归一到统一规格，环境音一并压低
      await run([
        "-i", clip.videoPath,
        "-t", cut,
        "-vf",
        `scale=${OUT_WIDTH}:${OUT_HEIGHT}:force_original_aspect_ratio=decrease,` +
          `pad=${OUT_WIDTH}:${OUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
        "-r", String(OUT_FPS),
        "-af", `volume=${AMBIENT_DB}dB`,
        "-ar", "48000", "-ac", "2",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", OUT_PIX_FMT,
        "-c:a", "aac",
        basePart,
      ]);

      let current = basePart;

      // ② 叠字幕条
      if (withSubtitles && (shot.subtitle || "").trim()) {
        const png = path.join(workDir, `sub-${stem}.png`);
        await writeFile(png, await renderSubtitlePng(shot.subtitle, { width: OUT_WIDTH, height: OUT_HEIGHT }));
        const withSub = path.join(workDir, `sub-${stem}.mp4`);
        await run([
          "-i", current, "-i", png,
          "-filter_complex", "[0:v][1:v]overlay=0:0:format=yuv420[v]",
          "-map", "[v]", "-map", "0:a",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", OUT_PIX_FMT,
          "-c:a", "copy",
          withSub,
        ]);
        current = withSub;
      }

      // ③ 口播混进去。补静音到整镜长度，否则 amix 会按最短的那路提前收尾
      if (voiceover) {
        const padded = path.join(workDir, `vo-${stem}.wav`);
        await run([
          "-i", voiceover.path,
          "-af", `volume=${VOICE_GAIN},apad`,
          "-t", cut, "-ar", "48000", "-ac", "2", padded,
        ]);
        const mixed = path.join(workDir, `mix-${stem}.mp4`);
        await run([
          "-i", current, "-i", padded,
          "-filter_complex", "amix=inputs=2:duration=first",
          "-map", "0:v", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
          mixed,
        ]);
        current = mixed;
      }

      partFiles.push(current);
    }

    if (tooShort.length > 0) {
      return apiBadRequest(`这几镜放不下口播，按更长的档位重新生成：${tooShort.join("；")}`);
    }

    // ④ 拼接。各段编码参数已归一，可以直接流拷贝
    const listFile = path.join(workDir, "parts.txt");
    await writeFile(listFile, partFiles.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
    const target = finalCutPath(projectId);
    await rm(target, { force: true });
    // +faststart 把 moov 原子挪到文件头。
    // 不加的话 moov 落在 mdat 后面，网页里的 <video> 必须整个文件下完才起播，
    // 表现就是点了播放却一直停在 0:00。
    await run([
      "-f", "concat", "-safe", "0", "-i", listFile,
      "-c", "copy", "-movflags", "+faststart", target,
    ]);

    const durationSec = await probeDurationSec(target);
    const finalCut: FinalCut = {
      path: target,
      durationSec: Number(durationSec.toFixed(2)),
      withSubtitles,
      withVoiceover,
      createdAt: new Date().toISOString(),
      extendedShots,
    };
    const saved = await writeProject({ ...project, voiceovers, finalCut });

    console.info("[VideoFactory] 成片已合成", {
      action: "videoFactory.compose",
      projectId,
      shots: shots.length,
      durationSec: finalCut.durationSec,
      extended: extendedShots.length,
    });

    // 中间产物留着只会让项目目录越滚越大，成片已经落盘了
    await rm(workDir, { recursive: true, force: true });

    return apiOk({ project: saved, finalCut }, `已合成 ${finalCut.durationSec.toFixed(1)} 秒成片`);
  } catch (error) {
    console.error("[VideoFactory] 合成失败", { action: "videoFactory.compose", projectId });
    return apiError(error, "videoFactory.compose", "合成失败");
  }
}

/** 取成片本体，给界面预览和下载用；直接回视频，不套信封。 */
export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("projectId") || "";
  try {
    if (!isSafeSegment(id)) return new NextResponse("项目 id 不合法", { status: 400 });
    return await serveVideoFile(request, finalCutPath(id), "还没有合成成片");
  } catch (error) {
    console.error("[VideoFactory] 成片读取失败", {
      userId: "local",
      action: "videoFactory.compose.read",
      projectId: id,
      error,
    });
    return new NextResponse("成片读取失败", { status: 500 });
  }
}
