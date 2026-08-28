import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk } from "@/app/api/feishu/_utils";
import { BENCHMARK_ROOT, FACE_MODELS_DIR, RENDERER_URL, benchmarkDir, isSafeSegment, mapLimited, newProjectId, runCommand } from "@/app/api/video-factory/_shared";
import { beatsFrom, readLoudnessSafe } from "@/app/api/video-factory/benchmark/_audio";
import { readRhythm, writeRhythm } from "@/app/api/video-factory/benchmark/_rhythm";
import { dropScreenFrames, runScreening } from "@/app/api/video-factory/benchmark/_screen";
import { assignVoiceovers, transcribe } from "@/app/api/video-factory/benchmark/_transcript";
import {
  DEFAULT_RHYTHM_THRESHOLD,
  MIN_SHOT_SEC,
  PROVIDER_CAPS,
  clippedShots,
  cutsToShots,
  ffmpegThreshold,
  normalizeThreshold,
  type CutDetector,
  type BenchmarkRhythm,
  type BenchmarkShot,
  type BenchmarkShotMetrics,
  type BenchmarkSource,
} from "@/lib/videoFactory";

// 跑本机 ffmpeg / ffprobe，必须 nodejs runtime。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const COMMAND_TIMEOUT_MS = 4 * 60 * 1000;
/** 超过这个镜头数就不逐镜抽帧了：再多也看不过来，还白等 */
const MAX_THUMBNAILS = 60;
/** 抽帧的并发。实测 6 路是拐点，再往上被同一个源文件的读竞争吃掉 */
const THUMBNAIL_CONCURRENCY = 6;
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

/**
 * ffmpeg 的 scene 滤镜：全局固定阈值的帧间像素差。
 * 装不了 PySceneDetect 时的兜底——它不会误切，但会漏掉同机位同场景下的切换。
 */
async function detectCutsFfmpeg(file: string, threshold: number): Promise<number[]> {
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

/**
 * 切镜点。优先 PySceneDetect 的自适应判据，没装就回落 ffmpeg。
 *
 * 为什么优先它：五条样本实测，ffmpeg 一刀没多切，但漏了 7 刀，
 * 而漏掉的全是换装、景别变化、人物进出画面这类同机位同场景的切换——
 * 一件换装视频漏掉换装那一刀，节奏模板就把两次换装当成了一镜。
 *
 * 回落是有意保留的：切镜是拆片的必经步骤，不像结构量化那样可选，
 * 让它硬依赖一个 pip 包，等于谁没装谁就整条用不了。
 */
async function detectCuts(
  file: string,
  threshold: number,
): Promise<{ cuts: number[]; detector: CutDetector }> {
  try {
    const script = path.join(process.cwd(), "scripts", "video-factory", "detect-cuts.py");
    const raw = await run("python3", [script, file, String(threshold), String(MIN_SHOT_SEC)]);
    // 和结构量化同一个坑：runCommand 把 stderr 接在 stdout 后面，按位置取会拿到警告
    const line = raw
      .split("\n")
      .map((item) => item.trim())
      .find((item) => item.startsWith("{") && item.endsWith("}")) || "";
    const parsed = JSON.parse(line) as { cuts?: number[]; error?: string };
    if (parsed.cuts?.length) return { cuts: parsed.cuts, detector: "adaptive" };
    if (parsed.error) throw new Error(parsed.error);
    // 空数组是合法结果（整条片子一刀没切），但那太反常，宁可换个判据再看一眼
    throw new Error("一个切点都没检出");
  } catch (error) {
    console.warn("[VideoFactory] 自适应切镜没跑成，回落 ffmpeg", {
      action: "videoFactory.benchmark.cuts",
      hint: "装上更准：pip3 install scenedetect opencv-python-headless",
      error: error instanceof Error ? error.message : String(error),
    });
    return { cuts: await detectCutsFfmpeg(file, ffmpegThreshold(threshold)), detector: "ffmpeg" };
  }
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
    // runCommand 把 stderr 接在 stdout 后面，而 OpenCV 会往 stderr 吐 backend 警告，
    // 所以不能按位置取——按内容找那行 JSON。
    const line = raw
      .split("\n")
      .map((item) => item.trim())
      .find((item) => item.startsWith("{") && item.endsWith("}")) || "";
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
    // 换判据之前存的阈值是另一套数，normalizeThreshold 会把认不出来的收敛回默认档
    const threshold = normalizeThreshold(Number(formData.get("threshold") || DEFAULT_RHYTHM_THRESHOLD));
    const videoFile = formData.get("videoFile");
    // 重测灵敏度时沿用同一个目录，不必重新下载/上传视频
    const reuseId = String(formData.get("id") || "").trim();

    id = reuseId && isSafeSegment(reuseId) ? reuseId : newProjectId();
    const dir = benchmarkDir(id);
    await mkdir(dir, { recursive: true });
    const source = path.join(dir, "source.mp4");

    // 来路决定这条片子的片段能不能进编辑通道，所以在写文件的同一处定下来，
    // 之后任何一步都不再改它——分开写迟早会出现「文件是传的、来路记成抓的」
    let origin: BenchmarkSource["origin"] | null = null;
    if (videoFile instanceof File && videoFile.size > 0) {
      await writeFile(source, Buffer.from(await videoFile.arrayBuffer()));
      origin = "upload";
    } else if (videoUrl) {
      if (!isAllowedSource(videoUrl)) return apiBadRequest("只能拆本机拆片服务抓下来的视频，或者直接上传 mp4");
      const response = await fetch(videoUrl);
      if (!response.ok) return apiBadRequest(`取视频失败（${response.status}），先确认拆片服务还在跑`);
      await writeFile(source, Buffer.from(await response.arrayBuffer()));
      origin = "extractor";
    } else if (!reuseId) {
      return apiBadRequest("给个视频：从拆片结果送过来，或者直接上传 mp4");
    }

    // 转写和读音轨都只吃源文件，不等切镜结果。在这儿就发起，让它们和下面的
    // 切镜、抽帧、量结构并排跑——whisper 是这条链上最长的一根，排在后面纯属白等。
    const asr = transcribe(source, dir);
    const loudness = readLoudnessSafe(source);

    const info = await probe(source);
    if (!info.durationSec) return apiBadRequest("读不出视频时长，换个文件试试");

    const { cuts, detector } = await detectCuts(source, threshold);
    // 节奏模板是跨项目复用的，这里存的 plan 只是按默认引擎算的一种落法；
    // 真正套进某个项目时会按那个项目的引擎 replanRhythm 一次，所以这里不必纠结选谁。
    const bareShots = cutsToShots(cuts, info.durationSec, PROVIDER_CAPS["grok-cli"].durations);

    // 镜头边界已经变了，上一版按镜号缓存的大帧现在全指向别的画面，先扔掉
    await dropScreenFrames(id);

    // 缩略图逐镜抽，多的就不抽了——纯粹是白等。
    // 限并发跑：每次抽帧都是一次进程启动加一次定位，串着跑 30 张要三秒多，
    // 六路并行一秒出头；再往上加收益就被同一个源文件的读竞争吃掉了
    await mapLimited(bareShots.slice(0, MAX_THUMBNAILS), THUMBNAIL_CONCURRENCY, (shot) =>
      grabThumbnail(
        source,
        shot.startSec + shot.durationSec / 2,
        path.join(dir, `frame-${String(shot.order).padStart(2, "0")}.jpg`),
      ),
    );

    // 量出每一镜的结构。缩略图看不出「机位固定但人在后退」和「人不动但机位在推」的区别，
    // 而这两件事对复刻的指导完全相反。
    const metrics = await measureShots(source, bareShots);
    // 口播按镜切开：走编辑通道换掉主体之后，口型还是原片的，要补对口型就得知道这一镜说了什么
    const voiceovers = assignVoiceovers(bareShots, await asr);
    const shots: BenchmarkShot[] = bareShots.map((shot) => {
      const measured = metrics.get(shot.order);
      const voiceover = voiceovers.get(shot.order);
      return { ...shot, ...(measured ? { metrics: measured } : {}), ...(voiceover ? { voiceover } : {}) };
    });

    // 切点踩没踩鼓点，决定这套节奏换 BGM 之后还成不成立
    const beatSync = beatsFrom(await loudness, cuts, info.durationSec);

    // 重测灵敏度是拿同一个文件再切一遍，所以凡是「这条片子本身是什么」的信息都沿用上一份：
    // 来路重设成 upload 会把人工确认过的水印状态白白清掉，逼人再确认一遍同一条片子；
    // 标题重设成「对标视频」会把作者和原标题冲掉，而那是列表里认出这是哪条的唯一凭据。
    const previous = reuseId ? await readRhythm(id) : null;
    const sourceInfo: BenchmarkSource = origin ? { origin } : previous?.source || { origin: "upload" };

    const rhythm: BenchmarkRhythm = {
      id,
      sourceLabel:
        sourceLabel || previous?.sourceLabel || (videoFile instanceof File ? videoFile.name : "对标视频"),
      totalDurationSec: Math.round(info.durationSec * 100) / 100,
      width: info.width,
      height: info.height,
      threshold,
      detector,
      shots,
      createdAt: new Date().toISOString(),
      source: sourceInfo,
      ...(beatSync ? { beatSync } : {}),
    };
    // 走 writeRhythm 而不是直接写：重拆之后镜头边界全变了，
    // 上一版切下来的原片段必须在这一步就被清掉，不能等到看完片
    await writeRhythm(id, rhythm);

    // 顺手看一遍片，拿到可替换的实体和每镜画面内容。
    // 不做成手动一步：忘了点的话，分镜表的画面就是模型照脚本现编的，和对标片实际拍了什么无关。
    // 和结构量化一样失败即跳过——节奏是 ffmpeg 的硬数据，不该被模型拖垮。
    let finalRhythm = rhythm;
    try {
      const screened = await runScreening(id, rhythm);
      finalRhythm = screened.rhythm;
    } catch (error) {
      console.warn("[VideoFactory] 拆片后看片失败，只留节奏", {
        action: "videoFactory.benchmark.screen",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const described = finalRhythm.shots.filter((shot) => shot.content).length;
    const clipped = clippedShots(finalRhythm).length;
    console.info("[VideoFactory] 节奏拆解完成", {
      action: "videoFactory.benchmark",
      id,
      threshold,
      detector,
      shotCount: shots.length,
      described,
      clipped,
      origin: sourceInfo.origin,
      castCount: finalRhythm.cast?.length || 0,
    });
    return apiOk(
      { rhythm: finalRhythm },
      described
        ? `切出 ${shots.length} 个镜头，${described} 镜有画面描述`
        : `切出 ${shots.length} 个镜头`,
    );
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
