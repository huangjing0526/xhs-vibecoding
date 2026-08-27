import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk } from "@/app/api/feishu/_utils";
import { BENCHMARK_ROOT, FACE_MODELS_DIR, RENDERER_URL, benchmarkDir, isSafeSegment, newProjectId, runCommand } from "@/app/api/video-factory/_shared";
import {
  PROVIDER_CAPS,
  RHYTHM_THRESHOLDS,
  cutsToShots,
  type BenchmarkRhythm,
  type BenchmarkShot,
  type BenchmarkShotMetrics,
} from "@/lib/videoFactory";

// 跑本机 ffmpeg / ffprobe，必须 nodejs runtime。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const COMMAND_TIMEOUT_MS = 4 * 60 * 1000;
/** 超过这个镜头数就不逐镜抽帧了：再多也看不过来，还白等 */
const MAX_THUMBNAILS = 60;
const EXTRACTOR_URL = RENDERER_URL;

const run = (command: string, args: string[]) =>
  runCommand(command, args, {
    timeoutMs: COMMAND_TIMEOUT_MS,
    timeoutMessage: `${command} 执行超时，换条短一点的片子试试`,
  });

interface ProbeResult {
  durationSec: number;
  width: number;
  height: number;
}

async function probe(file: string): Promise<ProbeResult> {
  const out = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1",
    file,
  ]);
  const pick = (key: string) => Number(out.match(new RegExp(`${key}=([0-9.]+)`))?.[1] || 0);
  return { durationSec: pick("duration"), width: pick("width"), height: pick("height") };
}

/** ffmpeg 的 scene 滤镜给出画面突变的时间点，这是不经模型的硬数据。 */
async function detectCuts(file: string, threshold: number): Promise<number[]> {
  const out = await run("ffmpeg", [
    "-hide_banner",
    "-i", file,
    "-vf", `select='gt(scene,${threshold})',metadata=print`,
    "-an",
    "-f", "null",
    "-",
  ]);
  return [...out.matchAll(/pts_time:([0-9.]+)/g)].map((match) => Number(match[1]));
}

/** 每镜取中点那一帧当缩略图——开头结尾常常是转场糊的。 */
async function grabThumbnail(file: string, atSec: number, target: string) {
  await run("ffmpeg", [
    "-hide_banner", "-v", "error",
    "-ss", atSec.toFixed(2),
    "-i", file,
    "-frames:v", "1",
    "-vf", "scale=200:-2",
    "-q:v", "4",
    "-y", target,
  ]);
}

/**
 * 逐镜量结构：机位动没动、主体走近还是后退、节奏怎么分段。
 *
 * 跑本机 python 脚本（OpenCV），失败一律吞掉：结构指标是锦上添花，
 * 缺了照样能拆节奏、能往下走。宁可没有，也不能因为它把整条拆解搞崩。
 */
async function measureShots(source: string, shots: BenchmarkShot[]): Promise<Map<number, BenchmarkShotMetrics>> {
  const out = new Map<number, BenchmarkShotMetrics>();
  try {
    const script = path.join(process.cwd(), "scripts", "video-factory", "shot-metrics.py");
    const payload = JSON.stringify(
      shots.map((shot) => ({ order: shot.order, startSec: shot.startSec, endSec: shot.endSec })),
    );
    const raw = await run("python3", [script, source, payload, "--models", FACE_MODELS_DIR]);
    // 脚本可能往 stdout 前面吐 OpenCV 的 backend 警告，只取最后一行 JSON
    const line = raw.trim().split("\n").filter(Boolean).pop() || "";
    const parsed = JSON.parse(line) as { shots?: Array<BenchmarkShotMetrics & { order: number }>; error?: string };
    if (parsed.error) {
      console.warn("[VideoFactory] 结构量化跳过", { action: "videoFactory.benchmark.metrics", reason: parsed.error });
      return out;
    }
    for (const item of parsed.shots || []) {
      const { order, ...metrics } = item;
      out.set(order, metrics);
    }
  } catch (error) {
    console.warn("[VideoFactory] 结构量化失败，只留节奏", {
      action: "videoFactory.benchmark.metrics",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return out;
}

/** 只放行本机拆片服务的产物地址，避免这个接口变成任意 URL 下载器。 */
function isAllowedSource(url: string): boolean {
  try {
    return new URL(url).origin === new URL(EXTRACTOR_URL).origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  let id = "";
  try {
    const formData = await request.formData();
    const videoUrl = String(formData.get("videoUrl") || "").trim();
    const sourceLabel = String(formData.get("sourceLabel") || "").trim();
    const rawThreshold = Number(formData.get("threshold") || 0.3);
    const threshold = RHYTHM_THRESHOLDS.some((item) => item.value === rawThreshold) ? rawThreshold : 0.3;
    const videoFile = formData.get("videoFile");
    // 重测灵敏度时沿用同一个目录，不必重新下载/上传视频
    const reuseId = String(formData.get("id") || "").trim();

    id = reuseId && isSafeSegment(reuseId) ? reuseId : newProjectId();
    const dir = benchmarkDir(id);
    await mkdir(dir, { recursive: true });
    const source = path.join(dir, "source.mp4");

    if (videoFile instanceof File && videoFile.size > 0) {
      await writeFile(source, Buffer.from(await videoFile.arrayBuffer()));
    } else if (videoUrl) {
      if (!isAllowedSource(videoUrl)) return apiBadRequest("只能拆本机拆片服务抓下来的视频，或者直接上传 mp4");
      const response = await fetch(videoUrl);
      if (!response.ok) return apiBadRequest(`取视频失败（${response.status}），先确认拆片服务还在跑`);
      await writeFile(source, Buffer.from(await response.arrayBuffer()));
    } else if (!reuseId) {
      return apiBadRequest("给个视频：从拆片结果送过来，或者直接上传 mp4");
    }

    const info = await probe(source);
    if (!info.durationSec) return apiBadRequest("读不出视频时长，换个文件试试");

    const cuts = await detectCuts(source, threshold);
    // 节奏模板是跨项目复用的，这里存的 plan 只是按默认引擎算的一种落法；
    // 真正套进某个项目时会按那个项目的引擎 replanRhythm 一次，所以这里不必纠结选谁。
    const bareShots = cutsToShots(cuts, info.durationSec, PROVIDER_CAPS["grok-cli"].durations);

    // 缩略图逐镜抽，多的就不抽了——纯粹是白等
    for (const shot of bareShots.slice(0, MAX_THUMBNAILS)) {
      const middle = shot.startSec + shot.durationSec / 2;
      await grabThumbnail(source, middle, path.join(dir, `frame-${String(shot.order).padStart(2, "0")}.jpg`));
    }

    // 量出每一镜的结构。缩略图看不出「机位固定但人在后退」和「人不动但机位在推」的区别，
    // 而这两件事对复刻的指导完全相反。
    const metrics = await measureShots(source, bareShots);
    const shots: BenchmarkShot[] = bareShots.map((shot) => {
      const measured = metrics.get(shot.order);
      return measured ? { ...shot, metrics: measured } : shot;
    });

    const rhythm: BenchmarkRhythm = {
      id,
      sourceLabel: sourceLabel || (videoFile instanceof File ? videoFile.name : "对标视频"),
      totalDurationSec: Math.round(info.durationSec * 100) / 100,
      width: info.width,
      height: info.height,
      threshold,
      shots,
      createdAt: new Date().toISOString(),
    };
    await writeFile(path.join(dir, "rhythm.json"), JSON.stringify(rhythm, null, 2), "utf8");

    console.info("[VideoFactory] 节奏拆解完成", {
      action: "videoFactory.benchmark",
      id,
      threshold,
      shotCount: shots.length,
    });
    return apiOk({ rhythm }, `切出 ${shots.length} 个镜头`);
  } catch (error) {
    console.error("[VideoFactory] 节奏拆解失败", { action: "videoFactory.benchmark", id });
    return apiError(error, "videoFactory.benchmark", "节奏拆解失败");
  }
}

/** 拆过的节奏是可复用的模板，列出来给人直接套。 */
export async function GET() {
  try {
    let entries: string[];
    try {
      entries = (await readdir(BENCHMARK_ROOT, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && isSafeSegment(entry.name))
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return apiOk({ rhythms: [] }, "还没拆过节奏");
    }

    const rhythms = (
      await Promise.all(
        entries.map(async (entryId) => {
          try {
            return JSON.parse(await readFile(path.join(benchmarkDir(entryId), "rhythm.json"), "utf8")) as BenchmarkRhythm;
          } catch {
            return null;
          }
        }),
      )
    )
      .filter((item): item is BenchmarkRhythm => Boolean(item))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return apiOk({ rhythms }, `已有 ${rhythms.length} 份节奏模板`);
  } catch (error) {
    return apiError(error, "videoFactory.benchmark.list", "节奏模板读取失败");
  }
}

/** 删一份节奏模板，连它的源视频和关键帧一起删——一条片子几兆，留着只占地方。 */
export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id") || "";
  try {
    if (!isSafeSegment(id)) return apiBadRequest("节奏 id 不合法");
    await rm(benchmarkDir(id), { recursive: true, force: true });
    return apiOk({ id }, "节奏模板已删除");
  } catch (error) {
    return apiError(error, "videoFactory.benchmark.delete", "节奏模板删除失败");
  }
}
