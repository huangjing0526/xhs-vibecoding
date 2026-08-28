/**
 * 看片：一次调用拿三样东西——可复刻性风险、可替换的实体清单、每一镜画面内容。
 *
 * 为什么合成一次：三样看的是同一批关键帧。分三次调用等于同一叠图的 token 付三遍，
 * 而模型认「产品1 出现在第 1、2 镜」这件事本来就需要同时看到那几张图。
 *
 * 拆片完自动跑一次，也可以手动重跑。失败一律不影响节奏本身——
 * 节奏是 ffmpeg 算出来的硬数据，看片是锦上添花，不能因为它把整条拆解搞崩。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { benchmarkDir, benchmarkSourcePath, runCommand } from "@/app/api/video-factory/_shared";
import { writeRhythm } from "@/app/api/video-factory/benchmark/_rhythm";
import { generateWorkflowJson, type WorkflowImage } from "@/lib/workflowAi";
import {
  clippedShots,
  createFallbackReport,
  buildReplicabilityPrompt,
  normalizeScreening,
  pickFramesToScreen,
  type BenchmarkRhythm,
  type BenchmarkShot,
} from "@/lib/videoFactory";

const FRAME_TIMEOUT_MS = 60 * 1000;

/**
 * 送去看的帧比列表缩略图大。
 *
 * 缩略图是 200 宽，判「有几个人」够用，判景别构图和光线色调不够——
 * 而这两样正是内容层要照抄的东西。抽一份大的另存，重跑筛查时直接复用。
 */
const SCREEN_FRAME_WIDTH = 640;

const frameFile = (dir: string, order: number) => path.join(dir, `frame-${String(order).padStart(2, "0")}.jpg`);
const screenFrameFile = (dir: string, order: number) =>
  path.join(dir, `screen-${String(order).padStart(2, "0")}.jpg`);

/**
 * 取一镜的大帧：已经抽过就直接读，没有就从源视频抽一张。
 * 源视频没了或 ffmpeg 抽失败，回落到那张 200 宽的缩略图——小图也比没图强。
 */
async function readScreenFrame(benchmarkId: string, dir: string, shot: BenchmarkShot): Promise<Buffer | null> {
  const target = screenFrameFile(dir, shot.order);
  const cached = await readFile(target).catch(() => null);
  if (cached) return cached;

  const source = benchmarkSourcePath(benchmarkId);
  const middle = shot.startSec + shot.durationSec / 2;
  try {
    await runCommand(
      "ffmpeg",
      [
        "-hide_banner", "-v", "error",
        "-ss", middle.toFixed(2),
        "-i", source,
        "-frames:v", "1",
        "-vf", `scale=${SCREEN_FRAME_WIDTH}:-2`,
        "-q:v", "3",
        "-y", target,
      ],
      { timeoutMs: FRAME_TIMEOUT_MS, timeoutMessage: "抽帧超时" },
    );
    const bytes = await readFile(target).catch(() => null);
    if (bytes) return bytes;
  } catch (error) {
    console.warn("[VideoFactory] 大帧抽取失败，回落到缩略图", {
      action: "videoFactory.screen.frame",
      shot: shot.order,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return readFile(frameFile(dir, shot.order)).catch(() => null);
}

export interface ScreeningOutcome {
  rhythm: BenchmarkRhythm;
  /** 实际送去看了几帧；0 表示一张图都没读到，模型压根没调 */
  frames: number;
  usedFallback: boolean;
  provider: string;
}

/**
 * 看一遍片，把结果并回节奏模板并落盘。
 *
 * 重跑是整体替换而不是合并：这一次没描述到的镜头，上一次的描述也不该留着——
 * 灵敏度一改镜头边界就变了，旧描述会挂到一段完全不同的画面上。
 */
export async function runScreening(id: string, rhythm: BenchmarkRhythm): Promise<ScreeningOutcome> {
  const dir = benchmarkDir(id);

  // 帧多了只是重复信息，均匀抽样，首尾必留
  const picked = pickFramesToScreen(rhythm.shots);
  const images: WorkflowImage[] = [];
  const screened: BenchmarkShot[] = [];
  for (const shot of picked) {
    const bytes = await readScreenFrame(id, dir, shot);
    if (!bytes) continue;
    images.push({ mimeType: "image/jpeg", base64: bytes.toString("base64") });
    // 送去的帧和 prompt 里的编号必须一一对应，所以按真正读到的那些帧建清单，
    // 而不是按 picked——中间漏掉一张，后面每一条结论就都挂到别的镜头上了
    screened.push(shot);
  }
  if (!images.length) {
    return { rhythm, frames: 0, usedFallback: true, provider: "" };
  }

  const fallback = createFallbackReport();
  const ai = await generateWorkflowJson<Parameters<typeof normalizeScreening>[0]>({
    action: "videoFactory.replicability",
    prompt: buildReplicabilityPrompt(screened),
    fallback,
    images,
    // 现在一次要回风险 + 实体 + 逐镜四段内容，3000 会在镜头多时被截断成半条 JSON
    maxTokens: 8000,
  });
  const { report, cast, contentByOrder } = normalizeScreening(ai.result, fallback, screened);

  const next: BenchmarkRhythm = {
    ...rhythm,
    report,
    cast,
    shots: rhythm.shots.map((shot) => {
      const content = contentByOrder.get(shot.order);
      const { content: _stale, ...rest } = shot;
      return content ? { ...rest, content } : rest;
    }),
  };
  // 路线是这一步刚判出来的，磁盘上的片段得跟着换一批——writeRhythm 会先把它们对齐
  const synced = await writeRhythm(id, next);

  console.info("[VideoFactory] 看片完成", {
    action: "videoFactory.replicability",
    id,
    frames: images.length,
    verdict: report.verdict,
    castCount: cast.length,
    described: contentByOrder.size,
    clipped: clippedShots(synced).length,
  });
  return { rhythm: synced, frames: images.length, usedFallback: ai.usedFallback, provider: ai.provider };
}
