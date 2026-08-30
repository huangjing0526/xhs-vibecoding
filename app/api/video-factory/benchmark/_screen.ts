/**
 * 看片：分两趟，因为这两件事该覆盖多少镜头不一样。
 *
 * - **路线**走全量、分批送。判「这一镜该走哪条通道」漏掉一镜，代价是分镜表把该切片编辑的
 *   镜头当成能直接生成的，后面整段活儿白干。34 镜的片子只判 12 镜等于大半没判。
 * - **内容**守 12 帧上限。四段画面描述是重活儿，抽样之外的镜头明确标成 undescribed，
 *   下游知道那几镜没底稿——和结构量化「测不了就说测不了」同一条规矩。
 *
 * 实体清单和逐镜画面仍然必须同一次调用回来：描述里的 {角色1} 是模型写实体清单时
 * 一起写下的，分两次要，第二次会重新编号，占位符全成孤儿。
 *
 * 两趟共用同一批大帧，磁盘上抽一次、内存里读一次，重复的只有那 12 张的 base64。
 *
 * 拆片完自动跑一次，也可以手动重跑。失败一律不影响节奏本身——
 * 节奏是 ffmpeg 算出来的硬数据，看片是锦上添花，不能因为它把整条拆解搞崩。
 */

import { readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { benchmarkDir, benchmarkSourcePath, mapLimited, runCommand } from "@/app/api/video-factory/_shared";
import { writeRhythm } from "@/app/api/video-factory/benchmark/_rhythm";
import { generateWorkflowJson, type WorkflowImage } from "@/lib/workflowAi";
import {
  buildContentPrompt,
  buildRoutePrompt,
  chunkShotsForRoute,
  clippedShots,
  createFallbackReport,
  normalizeRoutes,
  normalizeScreening,
  pickFramesToScreen,
  type BenchmarkRhythm,
  type BenchmarkShot,
  type ReplicabilityReport,
  type ScreeningResult,
  type ShotRisk,
  type UnroutedShot,
} from "@/lib/videoFactory";

const FRAME_TIMEOUT_MS = 60 * 1000;

/** 抽帧的并发。与拆片时抽缩略图取同一个数，理由也一样：再往上被同一个源文件的读竞争吃掉 */
const FRAME_CONCURRENCY = 6;

/**
 * 同时跑几批路线判定。
 *
 * 每批绝大部分时间在等模型回话，本机 CPU 是闲的，所以并着跑划算；
 * 但也不能全放——provider 侧限流触发 429 之后走的是退避重试，压上去反而更慢。
 */
const ROUTE_CONCURRENCY = 2;

/** 模型没回话时那两个字段的兜底。只有 verdict 和 summary 会被读到 */
const FALLBACK_REPORT = createFallbackReport();

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

/**
 * 扔掉缓存的大帧。
 *
 * 缓存只按镜号命名，而镜号在重拆之后指向的是另一段画面——
 * 阈值一调、判据一换，第 12 镜就从 30 镜版本的 12 镜变成了 33 镜版本的 12 镜。
 * 不清的话，模型看着旧边界的画面，结论却挂到新镜号上，整份描述会错位到别的镜头。
 *
 * 只在重拆时调；重看片沿用缓存正是它存在的理由——同一批边界不必重抽一遍。
 */
export async function dropScreenFrames(benchmarkId: string): Promise<void> {
  const dir = benchmarkDir(benchmarkId);
  const entries = await readdir(dir).catch(() => [] as string[]);
  for (const name of entries) {
    if (/^screen-\d+\.jpg$/.test(name)) await unlink(path.join(dir, name)).catch(() => {});
  }
}

export interface ScreeningOutcome {
  rhythm: BenchmarkRhythm;
  /** 这一趟真正读到并送出去的关键帧数。0 表示一张都没读到，模型压根没调 */
  frames: number;
  usedFallback: boolean;
  provider: string;
}

/** 一趟调用跑完之后的出处：谁跑的、是不是回落到了兜底。 */
interface PassOrigin {
  usedFallback: boolean;
  provider: string;
}

/**
 * 全部镜头的大帧读成可直接送模型的形状；读不到的镜头不在表里。
 *
 * 限并发跑：每一镜没缓存时都是一次 ffmpeg 定位抽帧，34 镜串着跑要三秒多，
 * 六路并行半秒出头。并发数与拆片时抽缩略图那处取同一个数，理由也一样——
 * 再往上加收益就被同一个源文件的读竞争吃掉了。
 */
async function readScreenImages(id: string, shots: BenchmarkShot[]): Promise<Map<number, WorkflowImage>> {
  const dir = benchmarkDir(id);
  const bytes = await mapLimited(shots, FRAME_CONCURRENCY, (shot) => readScreenFrame(id, dir, shot));
  const images = new Map<number, WorkflowImage>();
  for (const [index, buffer] of bytes.entries()) {
    if (buffer) images.set(shots[index].order, { mimeType: "image/jpeg", base64: buffer.toString("base64") });
  }
  return images;
}

interface RoutePass extends PassOrigin {
  risks: ShotRisk[];
  /** 所在批次调用失败、因而没判出路线的镜号 */
  failed: number[];
  /** 各批的第一个错误，两趟都没成时要拿它抛出去 */
  errors: unknown[];
}

/**
 * 判路线：全量镜头分批送，每批各自映射回镜号。
 *
 * 一批失败只丢那一批，不拖垮其余——三十几镜的片子里丢 12 镜的路线，
 * 也好过因为一次模型抽风让整条片子一镜都没判过。丢了哪几镜由 failed 说话，不是估的。
 *
 * try/catch 必须留在 task 里面：漏到 mapLimited 外面的话，一批抛错会经 Promise.all
 * 把整趟带崩，「只丢那一批」就没了。
 */
async function runRoutePass(shots: BenchmarkShot[], images: Map<number, WorkflowImage>): Promise<RoutePass> {
  const batches = chunkShotsForRoute(shots);
  const done = await mapLimited(batches, ROUTE_CONCURRENCY, async (batch) => {
    try {
      const ai = await generateWorkflowJson<Parameters<typeof normalizeRoutes>[0]>({
        action: "videoFactory.replicability.route",
        prompt: buildRoutePrompt(batch),
        fallback: { shots: [] },
        images: batch.map((shot) => images.get(shot.order)!),
        // 一批 12 镜只回风险和一句话，比内容那一趟轻得多
        maxTokens: 3000,
      });
      return { risks: normalizeRoutes(ai.result, batch), origin: ai, error: null as unknown };
    } catch (error) {
      console.warn("[VideoFactory] 这一批镜头判路线失败，其余照跑", {
        action: "videoFactory.replicability.route",
        shots: `${batch[0]?.order}-${batch[batch.length - 1]?.order}`,
        error: error instanceof Error ? error.message : String(error),
      });
      return { risks: [] as ShotRisk[], origin: null, error };
    }
  });

  const ok = done.find((item) => item.origin);
  return {
    // mapLimited 按输入下标回收，批次本来就有序，批内也有序
    risks: done.flatMap((item) => item.risks),
    failed: batches.flatMap((batch, index) => (done[index].error ? batch.map((shot) => shot.order) : [])),
    errors: done.map((item) => item.error).filter(Boolean),
    usedFallback: ok?.origin?.usedFallback ?? true,
    provider: ok?.origin?.provider ?? "",
  };
}

interface ContentPass extends PassOrigin {
  /** 整趟失败时是 null——那不是「没看到」，是「没看成」，两者的处置不一样 */
  result: ScreeningResult | null;
  error: unknown;
}

/** 拆实体与逐镜画面。这一趟重，只送抽样到的那批帧。 */
async function runContentPass(
  id: string,
  screened: BenchmarkShot[],
  images: Map<number, WorkflowImage>,
): Promise<ContentPass> {
  try {
    const ai = await generateWorkflowJson<Parameters<typeof normalizeScreening>[0]>({
      action: "videoFactory.replicability.content",
      prompt: buildContentPrompt(screened),
      fallback: {},
      images: screened.map((shot) => images.get(shot.order)!),
      // 逐镜四段内容 + 实体清单，3000 会在镜头多时被截断成半条 JSON
      maxTokens: 8000,
    });
    return {
      result: normalizeScreening(ai.result, FALLBACK_REPORT, screened),
      error: null,
      usedFallback: ai.usedFallback,
      provider: ai.provider,
    };
  } catch (error) {
    console.warn("[VideoFactory] 拆实体与画面失败，保留上一次的描述", {
      action: "videoFactory.replicability.content",
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { result: null, error, usedFallback: true, provider: "" };
  }
}

/**
 * 看一遍片，把结果并回节奏模板并落盘。
 *
 * 画面描述是整体替换而不是合并：这一次没描述到的镜头，上一次的描述也不该留着——
 * 灵敏度一改镜头边界就变了，旧描述会挂到一段完全不同的画面上。
 * 但**整趟失败时不替换**：那不是「这次没看到」，是「这次没看成」，
 * 把上一次的成果一并抹掉等于拿一次模型抽风惩罚用户。
 */
export async function runScreening(id: string, rhythm: BenchmarkRhythm): Promise<ScreeningOutcome> {
  const images = await readScreenImages(id, rhythm.shots);
  // 送去的帧和 prompt 里的编号必须一一对应，所以按真正读到的那些帧建清单，
  // 中间漏掉一张，后面每一条结论就都挂到别的镜头上了
  const available = rhythm.shots.filter((shot) => images.has(shot.order));
  if (!available.length) {
    return { rhythm, frames: 0, usedFallback: true, provider: "" };
  }

  // 帧多了只是重复信息，均匀抽样，首尾必留
  const screened = pickFramesToScreen(available);
  // 内容那一趟不依赖路线的任何结果，串着跑纯属白等——最重的那次调用没必要排在队尾
  const [route, content] = await Promise.all([
    runRoutePass(available, images),
    runContentPass(id, screened, images),
  ]);

  // 两趟都没成就把错误抛出去，让调用方保住原样的节奏——
  // 这时写盘只会把一份空报告盖到上一次的成果上
  if (!route.risks.length && !content.result) {
    throw route.errors[0] ?? content.error;
  }

  // 这一趟没判到的镜头沿用上一份报告。整体替换的话，四批里失败三批会让一份完整的报告
  // 只剩一批的量，而紧接着 writeRhythm 会按新报告收敛片段——另外那些切好的原片段
  // 会被从磁盘上删掉。「边界变了旧结论就该丢」在这条路径上不成立：
  // 重拆传进来的 rhythm 本来就没有旧报告，有旧报告的只有手动重看，那时边界一个字都没动。
  const judged = new Set(route.risks.map((shot) => shot.order));
  const carried = (rhythm.report?.shots || []).filter((shot) => !judged.has(shot.order));
  const routedShots = [...route.risks, ...carried].sort((a, b) => a.order - b.order);

  const routed = new Set(routedShots.map((shot) => shot.order));
  const failed = new Set(route.failed);
  const unrouted: UnroutedShot[] = rhythm.shots
    .filter((shot) => !routed.has(shot.order))
    .map((shot) => ({ order: shot.order, reason: failed.has(shot.order) ? "batch-failed" : "no-frame" }));

  const { verdict, summary, recurringSubject } = content.result ?? {
    ...FALLBACK_REPORT,
    recurringSubject: "",
  };
  const report: ReplicabilityReport = {
    verdict,
    summary,
    recurringSubject,
    shots: routedShots,
    createdAt: new Date().toISOString(),
    ...(unrouted.length ? { unrouted } : {}),
  };

  const described = content.result;
  const next: BenchmarkRhythm = {
    ...rhythm,
    report,
    ...(described ? { cast: described.cast } : {}),
    shots: described
      ? rhythm.shots.map((shot) => {
          const one = described.contentByOrder.get(shot.order);
          const { content: _stale, ...rest } = shot;
          return one ? { ...rest, content: one } : rest;
        })
      : rhythm.shots,
  };
  // 路线是这一步刚判出来的，磁盘上的片段得跟着换一批——writeRhythm 会先把它们对齐
  const synced = await writeRhythm(id, next);

  // 出处取真正跑成了的那一趟：路线全判完、内容抛错的那次运行，
  // 照着内容那一趟报「未配置 AI」会把一份完整的路线报告说成压根没做成
  const origin: PassOrigin = content.result ? content : route;
  console.info("[VideoFactory] 看片完成", {
    action: "videoFactory.replicability",
    id,
    shots: rhythm.shots.length,
    routed: route.risks.length,
    carried: carried.length,
    unrouted: unrouted.length,
    described: synced.shots.filter((shot) => shot.content).length,
    verdict: report.verdict,
    castCount: synced.cast?.length ?? 0,
    clipped: clippedShots(synced).length,
  });
  return { rhythm: synced, frames: images.size, ...origin };
}
