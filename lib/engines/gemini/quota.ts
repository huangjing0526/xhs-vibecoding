/**
 * 把 Gemini 的 429 翻译成一句能照着做的话，并记住它。
 *
 * 免费层的图片 / 视频额度很小，429 是常态而不是异常，所以它值得被当成一等公民：
 * 撞过一次就记下来，下次打开引擎卡片直接显示「今天跑不了」，
 * 而不是让人重新点一遍、再等一遍、再看一次同样的报错。
 * 这跟 video-factory 提前探 grok 的 ZDR 开关是同一个思路。
 *
 * 为什么不主动发探针：countTokens 之类的轻量接口走的是另一套配额，
 * 探出来的「可用」跟生图能不能跑没有关系；而真发一次 generateContent
 * 成功时就已经生成并计费了。所以只能被动记录真实发生过的 429。
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GeminiRequestError } from "./index";

const STATE_DIR = path.join(process.cwd(), ".local", "engines");
const STATE_FILE = path.join(STATE_DIR, "gemini-quota.json");

export type QuotaWindow = "day" | "minute" | "unknown";

export interface QuotaVerdict {
  /** 是不是配额问题；不是的话下面的字段都不用看 */
  isQuota: boolean;
  /** 免费层配额，还是付费层的速率上限 */
  freeTier: boolean;
  /** 日配额（要等到明天）还是分钟配额（等一会儿即可） */
  window: QuotaWindow;
  /** 直接给用户看的一句话 */
  message: string;
}

interface QuotaRecord {
  model: string;
  window: QuotaWindow;
  freeTier: boolean;
  message: string;
  /** 本地日期（YYYY-MM-DD）：日配额按自然日重置，跨天后这条记录就作废 */
  date: string;
  at: string;
}

function readViolations(error: GeminiRequestError): Array<Record<string, unknown>> {
  const failure = error.details.find(
    (item) => item["@type"] === "type.googleapis.com/google.rpc.QuotaFailure",
  );
  const violations = failure?.violations;
  return Array.isArray(violations) ? (violations as Array<Record<string, unknown>>) : [];
}

function localDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * 判断配额窗口靠 quotaId 里的 PerDay / PerMinute，不靠 RetryInfo.retryDelay。
 * 实测日配额耗尽时 Google 仍然给 retryDelay: "33s"——照着它重试只会再撞一次 429。
 */
export function describeQuotaError(error: unknown): QuotaVerdict {
  if (!(error instanceof GeminiRequestError) || error.code !== 429) {
    return { isQuota: false, freeTier: false, window: "unknown", message: "" };
  }

  const violations = readViolations(error);
  const quotaId = String(violations[0]?.quotaId || "");
  const freeTier = quotaId.includes("FreeTier");
  const window: QuotaWindow = quotaId.includes("PerDay")
    ? "day"
    : quotaId.includes("PerMinute")
      ? "minute"
      : "unknown";

  const advice =
    window === "day"
      ? freeTier
        ? "今天跑不了了，等明天重置，或去 ai.dev 把项目升到付费"
        : "今天的额度已用完，等明天重置"
      : window === "minute"
        ? "这一分钟的额度用完了，等一会儿再试"
        : "换个模型或稍后再试";

  return {
    isQuota: true,
    freeTier,
    window,
    message: `Gemini ${freeTier ? "免费额度" : "配额"}已用完：${advice}`,
  };
}

/** 撞到 429 时记一笔，供引擎卡片直接展示。分钟级的不记——等一会儿就好，记了反而误导。 */
export async function recordQuotaExhausted(model: string, verdict: QuotaVerdict): Promise<void> {
  if (!verdict.isQuota || verdict.window === "minute") return;
  const record: QuotaRecord = {
    model,
    window: verdict.window,
    freeTier: verdict.freeTier,
    message: verdict.message,
    date: localDate(),
    at: new Date().toISOString(),
  };
  try {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(record, null, 2), "utf8");
  } catch (error) {
    // 记不上只是少一句提示，不该把整次生成拖失败，留痕即可
    console.error("[Gemini] 配额状态写入失败", {
      userId: "local",
      action: "gemini.quota.record",
      model,
      error,
    });
  }
}

/**
 * 包住一次会计费的调用：撞到配额就记一笔并翻成人话，其余错误原样抛。
 * 生图和出片各写一遍这段 catch 是没有意义的——它们对配额的处置完全相同。
 */
export async function withQuotaTracking<T>(model: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const verdict = describeQuotaError(error);
    if (!verdict.isQuota) throw error;
    await recordQuotaExhausted(model, verdict);
    throw new Error(verdict.message);
  }
}

/** 读回今天的配额状态；跨天的记录当作已重置，不再显示。 */
export async function readQuotaState(): Promise<QuotaRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(STATE_FILE, "utf8")) as QuotaRecord;
    return parsed.date === localDate() ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[Gemini] 配额状态读取失败", {
        userId: "local",
        action: "gemini.quota.read",
        error,
      });
    }
    return null;
  }
}
