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
  mapLimited,
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
  storyboardParts,
  type ComposePart,
  type FinalCut,
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

/**
 * 探时长的并发。纯 ffprobe 启动开销，10 次串行 0.42 秒、六路并行 0.09 秒。
 * 编码那一步刻意**不**并发：x264 自己就吃满核，实测 4 路并发比串行还慢 25%。
 */
const PROBE_CONCURRENCY = 6;

/** 配音的并发。纯网络往返，34 刀串着跑要一分多钟，四路并行降到二十几秒 */
const TTS_CONCURRENCY = 4;

/** 一刀的唯一键。配音结果按它认领，别用下标——中途 continue 掉的刀会让下标错位 */
const partKey = (part: ComposePart) => `${part.shotOrder}-${part.cutIndex}`;

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

/** 报错和账目里怎么称呼这一刀。并了镜的要说清是第几镜的第几刀，不然人对不到画面上 */
function describePart(part: ComposePart): string {
  return part.cutIndex > 0 ? `第 ${part.shotOrder} 镜第 ${part.cutIndex + 1} 刀` : `第 ${part.shotOrder} 镜`;
}

/**
 * 取一刀的配音：口播原文没变就直接用盘上那条，变了才重配。
 * 每次合成都全量重配的话，改一个字就要等五次网络往返。
 */
async function ensureVoiceover(
  project: VideoProject,
  part: ComposePart,
  voice: string,
  rate: string,
): Promise<ShotVoiceover> {
  const text = (part.voiceover || "").trim();
  // 老项目的配音没有 cutIndex，那时一镜就是一刀，当它是第 0 刀
  const cached = project.voiceovers.find(
    (item) => item.shotOrder === part.shotOrder && (item.cutIndex ?? 0) === part.cutIndex,
  );
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
    throw new Error(`${describePart(part)}配音失败（${response.status}）${detail ? `：${detail.slice(0, 200)}` : ""}`);
  }
  const data = (await response.json()) as { url?: string; durationSec?: number };
  if (!data.url) throw new Error(`${describePart(part)}配音服务没返回音频地址`);

  const audio = await fetch(data.url);
  if (!audio.ok) throw new Error(`${describePart(part)}配音下载失败（${audio.status}）`);
  const target = voiceoverPath(project.id, part.shotOrder, part.cutIndex);
  await writeFile(target, Buffer.from(await audio.arrayBuffer()));

  return {
    shotOrder: part.shotOrder,
    cutIndex: part.cutIndex,
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
    // 分镜表按生成单元存，合成按刀走：并了镜的一镜要从同一段生成画面里跳着取好几段，
    // 接起来才是对标原本的碎切。没并镜的展开成一刀，所以下面只有一条路径
    const parts = storyboardParts(project.storyboard!);

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

    // 时长探测和配音都是「和 ffmpeg 编码互不相干的等待」，先并发做完再进串行的编码循环。
    // 部件数从「镜数」变成「刀数」之后这两笔都翻了两三倍，串在循环里等的全是空耗
    const clipSecByShot = new Map<number, number>();
    const uniqueClips = [...new Map(project.clips.map((clip) => [clip.shotOrder, clip])).values()];
    const probed = await mapLimited(uniqueClips, PROBE_CONCURRENCY, async (clip) =>
      (await probeDurationSec(clip.videoPath)) || clip.durationSec,
    );
    uniqueClips.forEach((clip, index) => clipSecByShot.set(clip.shotOrder, probed[index]));

    const spoken = withVoiceover ? parts.filter((part) => (part.voiceover || "").trim()) : [];
    const spokenAudio = await mapLimited(spoken, TTS_CONCURRENCY, (part) =>
      ensureVoiceover(project, part, voice, rate),
    );
    const voiceoverByPart = new Map<string, ShotVoiceover>();
    spoken.forEach((part, index) => voiceoverByPart.set(partKey(part), spokenAudio[index]));

    for (const part of parts) {
      const clip = project.clips.find((item) => item.shotOrder === part.shotOrder)!;
      const clipSec = clipSecByShot.get(part.shotOrder)!;

      // 对标节奏给的计划时长
      const plannedSec = part.durationSec;

      const voiceover = voiceoverByPart.get(partKey(part)) ?? null;
      if (voiceover) voiceovers.push(voiceover);
      // 口播说不完的镜头是废镜头，所以口播长度是下限，对标节奏只能让步
      const neededSec = voiceover
        ? Math.max(plannedSec, voiceover.durationSec + VOICEOVER_TAIL_SEC)
        : plannedSec;

      // 口播比这一刀长时，先把取样起点往前挪，挪不动了才认输。
      //
      // 并了镜之后这一步是必须的：等距铺开的最后一刀正好收在生成素材的末尾，
      // 往后一秒余量都没有——不挪的话，凡是最后一刀的口播稍长就直接判「放不下」，
      // 而素材本身明明够长。往前挪只是把取样窗口移了一点，画面还是同一段连续镜头，
      // 代价是它和前一刀的间隔变窄、跳切感弱一点，比整条合不出来划算得多。
      const fromSec = Math.max(0, Math.min(part.fromSec, clipSec - neededSec));
      if (neededSec > clipSec + 0.05) {
        tooShort.push(
          `${describePart(part)}要 ${neededSec.toFixed(1)}s，整段素材只有 ${clipSec.toFixed(1)}s`,
        );
        continue;
      }
      if (neededSec > plannedSec + 0.01) {
        extendedShots.push({
          shotOrder: part.shotOrder,
          cutIndex: part.cutIndex,
          plannedSec: Number(plannedSec.toFixed(2)),
          actualSec: Number(neededSec.toFixed(2)),
        });
      }


      const cut = neededSec.toFixed(3);
      const stem = `${String(part.shotOrder).padStart(2, "0")}-${part.cutIndex}`;
      const partFile = path.join(workDir, `part-${stem}.mp4`);

      // 剪、归一、叠字幕、混口播，一条命令做完。
      //
      // 早先是分三趟：先编一遍、叠字幕再编一遍、再混音重封装一次。同一段画面被 libx264
      // 编两遍，中间还落一个用完即弃的 wav。并镜之后部件数从「镜数」涨到「刀数」，
      // 这笔重复实测到 2.5 倍：12 刀 12.7 秒 → 5.0 秒。
      //
      // -ss 放在 -i 前面：转码时 accurate_seek 是默认开的，input seek 会跳到前一个关键帧
      // 再解码丢弃到精确点，出来的首帧和放在后面逐字节相同，但省掉从头解码那一段——
      // 一刀取自第 7 秒的话，放后面要白解 7 秒。
      const inputs = ["-ss", fromSec.toFixed(3), "-i", clip.videoPath];
      const chains = [
        `[0:v]scale=${OUT_WIDTH}:${OUT_HEIGHT}:force_original_aspect_ratio=decrease,` +
          `pad=${OUT_WIDTH}:${OUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${OUT_FPS}[base]`,
      ];
      let videoTap = "[base]";

      if (withSubtitles && (part.subtitle || "").trim()) {
        const png = path.join(workDir, `sub-${stem}.png`);
        await writeFile(png, await renderSubtitlePng(part.subtitle, { width: OUT_WIDTH, height: OUT_HEIGHT }));
        inputs.push("-i", png);
        chains.push(`[base][1:v]overlay=0:0:format=yuv420[v]`);
        videoTap = "[v]";
      }

      // 各镜自带的环境音压低垫在口播下面；补静音到整刀长度，否则 amix 会按最短那路提前收尾
      if (voiceover) {
        inputs.push("-i", voiceover.path);
        const voiceIndex = withSubtitles && (part.subtitle || "").trim() ? 2 : 1;
        chains.push(`[0:a]volume=${AMBIENT_DB}dB[amb]`);
        chains.push(`[${voiceIndex}:a]volume=${VOICE_GAIN},apad[vo]`);
        chains.push(`[amb][vo]amix=inputs=2:duration=first[a]`);
      } else {
        chains.push(`[0:a]volume=${AMBIENT_DB}dB[a]`);
      }

      await run([
        ...inputs,
        "-t", cut,
        "-filter_complex", chains.join(";"),
        "-map", videoTap, "-map", "[a]",
        "-ar", "48000", "-ac", "2",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", OUT_PIX_FMT,
        "-c:a", "aac", "-b:a", "128k",
        partFile,
      ]);

      partFiles.push(partFile);
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
      parts: parts.length,
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
