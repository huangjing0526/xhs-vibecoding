/**
 * Veo 图生视频：提交一个长任务，轮询到完成，再把片子下载到本地。
 *
 * 与 grok 那条通道的形态差别：
 * grok 是本机起进程、跑完片子就在磁盘上（还得防它没照要求复制、去会话目录里捞）；
 * Veo 是提交 → 拿 operation → 轮询 → 拿到一个要带 key 才能取的 URI → 自己下载。
 * 步骤多，但每一步的失败都是明确的，不需要「跑完了去目录里找找看」那种兜底。
 */

import { writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GEMINI_API_BASE, geminiRequest, readGeminiKey } from "./index";
import { describeQuotaError, recordQuotaExhausted } from "./quota";

/** 轮询间隔。Veo 一条片子通常要 1~3 分钟，问得太勤只是白发请求。 */
const POLL_INTERVAL_MS = 10_000;
/** 总等待上限，超了就当这次失败——比让请求一直挂着强。 */
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

interface OperationResponse {
  name?: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: { uri?: string } }>;
      /** 被安全策略拦掉时的说明，done 也会是 true，但没有产出 */
      raiMediaFilteredReasons?: string[];
    };
  };
}

export interface VeoRequest {
  model: string;
  prompt: string;
  /** 首帧图的本机绝对路径 */
  framePath: string;
  durationSec: number;
  /** "720p" / "1080p" */
  resolution: string;
  /** "16:9" / "9:16"；不传则跟随模型默认 */
  aspectRatio?: string;
  outputPath: string;
  signal?: AbortSignal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readFrame(framePath: string): Promise<{ mimeType: string; data: string }> {
  const extension = path.extname(framePath).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) throw new Error("首帧图只支持 png / jpg / webp");
  const bytes = await readFile(framePath);
  return { mimeType, data: bytes.toString("base64") };
}

/**
 * 下载产出的视频。
 * 这个 URI 不是公开链接，必须带上 key 才能取，而且会 302 到真正的存储地址——
 * fetch 默认就跟随重定向，但 header 要自己保证带上。
 */
async function downloadVideo(uri: string, outputPath: string, signal?: AbortSignal): Promise<void> {
  const key = readGeminiKey();
  if (!key) throw new Error("没有配置 GEMINI_API_KEY");

  const response = await fetch(uri, { headers: { "x-goog-api-key": key }, signal });
  if (!response.ok) {
    throw new Error(`视频下载失败（HTTP ${response.status}），片子已生成但没取回来`);
  }
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

/**
 * 跑完一整条：提交 → 轮询 → 下载。
 *
 * 做成同步等待而不是「提交完就返回、让前端自己轮询」，是为了跟现有 grok 那条路由的
 * 交互形态保持一致——视频工厂的界面本来就是「点生成、等、出片」。
 * 真要改成异步，改这一个函数的调用方即可，协议这一层不用动。
 */
export async function generateVeoVideo(request: VeoRequest): Promise<{ outputPath: string }> {
  const image = await readFrame(request.framePath);

  const body = {
    instances: [{ prompt: request.prompt, image: { inlineData: image } }],
    parameters: {
      // durationSeconds 照文档用字符串
      durationSeconds: String(request.durationSec),
      resolution: request.resolution,
      ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
    },
  };

  let operation: OperationResponse;
  try {
    operation = await geminiRequest<OperationResponse>(
      `models/${request.model}:predictLongRunning`,
      { method: "POST", body, signal: request.signal },
    );
  } catch (error) {
    const verdict = describeQuotaError(error);
    if (verdict.isQuota) {
      await recordQuotaExhausted(request.model, verdict);
      throw new Error(verdict.message);
    }
    throw error;
  }

  const operationName = operation.name;
  if (!operationName) throw new Error("Veo 没有返回任务号，重试一次");

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let current = operation;

  while (!current.done) {
    if (Date.now() > deadline) {
      throw new Error("Veo 出片超时（10 分钟），任务可能还在跑，稍后再试或换更短的镜头");
    }
    await sleep(POLL_INTERVAL_MS);
    // operation name 本身就是完整路径（operations/xxx），直接接在 base 后面
    current = await geminiRequest<OperationResponse>(operationName, {
      method: "GET",
      signal: request.signal,
    });
  }

  if (current.error) {
    throw new Error(`Veo 出片失败：${current.error.message || `错误码 ${current.error.code}`}`);
  }

  const result = current.response?.generateVideoResponse;
  const filtered = result?.raiMediaFilteredReasons;
  if (filtered?.length) {
    // 被安全策略拦掉时任务也算「完成」，只是没有产出，得单独说清楚
    throw new Error(`Veo 拒绝了这一镜：${filtered[0]}`);
  }

  const uri = result?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error("Veo 任务完成了但没有产出视频，重试一次或换个提示词");

  await downloadVideo(uri, request.outputPath, request.signal);
  return { outputPath: request.outputPath };
}

/** 让调用方知道 base，operation 轮询用的是同一个前缀。 */
export const VEO_API_BASE = GEMINI_API_BASE;
