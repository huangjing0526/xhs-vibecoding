/**
 * Gemini HTTP 引擎的共用底座。
 *
 * 与 codex / grok 那两条通道的根本区别：它们是 spawn 本机 CLI、产物落在磁盘上再去捞，
 * 这条是纯 HTTP、产物直接在响应体里。所以这里没有 job 目录、没有超时杀进程，
 * 只有「发请求 + 把 Google 的错误翻译成人话」。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * 送进请求体的图片格式。
 * 与 app/api/image-factory/_shared.ts 那张表内容相同，但不能反过来 import——
 * lib/ 依赖 app/ 是反向依赖。等哪天这张表下沉到 lib/media，两处一起换。
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** 一张随请求内联送走的图。 */
export interface InlineImage {
  mimeType: string;
  data: string;
}

/**
 * 读一张本机图片成 inline 数据。
 * 生图的参考图和 Veo 的首帧图走的是同一件事，只是外面包的壳不同，
 * `label` 只用于把报错说成人话（「参考图」/「首帧图」）。
 */
export async function readInlineImage(filePath: string, label: string): Promise<InlineImage> {
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) throw new Error(`${label}只支持 png / jpg / webp`);
  const bytes = await readFile(filePath);
  return { mimeType, data: bytes.toString("base64") };
}

/** 与 lib/workflowAi.ts 用的是同一个环境变量，一份 key 供文本 / 图片 / 视频三处共用。 */
export function readGeminiKey(): string | undefined {
  const value = process.env.GEMINI_API_KEY;
  return value && value.trim() ? value.trim() : undefined;
}

/** Google 的标准错误体。details 里才有配额违规的细节，message 只是一句泛泛的话。 */
export interface GoogleApiError {
  code: number;
  status: string;
  message: string;
  details?: Array<Record<string, unknown>>;
}

export class GeminiRequestError extends Error {
  readonly code: number;
  readonly status: string;
  readonly details: Array<Record<string, unknown>>;

  constructor(error: GoogleApiError, friendlyMessage: string) {
    super(friendlyMessage);
    this.name = "GeminiRequestError";
    this.code = error.code;
    this.status = error.status;
    this.details = error.details || [];
  }
}

/**
 * key 走 header 不走 query string：query string 会跟着 URL 进访问日志和报错栈，
 * header 不会。Google 两种都支持，没有理由选会漏 key 的那种。
 */
function authHeaders(key: string): Record<string, string> {
  return { "x-goog-api-key": key, "Content-Type": "application/json" };
}

/**
 * 发一次 Gemini API 请求。
 * 错误统一抛 GeminiRequestError，由调用方决定翻译成哪句人话——
 * 同一个 429，生图时该说「今天的图额度用完了」，探测时该说「配额已耗尽」，不能在这里写死。
 */
export async function geminiRequest<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const key = readGeminiKey();
  if (!key) {
    throw new Error("没有配置 GEMINI_API_KEY，先在 .env.local 里填上再用 Gemini 引擎");
  }

  const response = await fetch(`${GEMINI_API_BASE}/${path.replace(/^\//, "")}`, {
    method: init.method,
    headers: authHeaders(key),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    // 非 JSON 响应基本只在网关层出问题时出现，原样带上前 200 字比吞掉有用
    throw new Error(`Gemini 返回了无法解析的响应（HTTP ${response.status}）：${text.slice(0, 200)}`);
  }

  const errorBody = (parsed as { error?: GoogleApiError }).error;
  if (errorBody) {
    throw new GeminiRequestError(errorBody, errorBody.message || `Gemini 请求失败（${errorBody.code}）`);
  }
  if (!response.ok) {
    throw new Error(`Gemini 请求失败（HTTP ${response.status}）`);
  }

  return parsed as T;
}
