/**
 * 生成引擎偏好：选哪个引擎、哪个模型，本机记住，首页与图片工厂共用一份。
 *
 * 存储 key 沿用图片工厂原来那个，不改名——改了等于把所有人已经选好的引擎清空一次。
 * 探测缓存也放在这里：CLI 状态检查要 spawn 好几个子进程，
 * 首页和图片工厂各探一次纯属白等，而这个状态在一次会话里几乎不变。
 */

import { getImageProviders } from "@/lib/workflowClient";
import type { CliProviderStatus, ImageCliProvider } from "@/lib/imageFactory";

const ENGINE_STORAGE_KEY = "vibenote.image-factory.engine.v1";

/** 探不到状态时的起手引擎——本机装得最普遍的那个。 */
export const DEFAULT_ENGINE: ImageCliProvider = "codex";

export interface EnginePreference {
  provider: ImageCliProvider;
  /** 空串表示跟随引擎自己的默认模型 */
  model: string;
}

function isProvider(value: unknown): value is ImageCliProvider {
  return value === "codex" || value === "grok" || value === "gemini";
}

export function readEnginePreference(): EnginePreference {
  if (typeof window === "undefined") return { provider: DEFAULT_ENGINE, model: "" };
  try {
    const saved = JSON.parse(localStorage.getItem(ENGINE_STORAGE_KEY) || "{}");
    return {
      provider: isProvider(saved.provider) ? saved.provider : DEFAULT_ENGINE,
      model: typeof saved.model === "string" ? saved.model : "",
    };
  } catch (error) {
    console.warn("[Engine] 引擎偏好读取失败", { action: "engine.readPreference", error });
    return { provider: DEFAULT_ENGINE, model: "" };
  }
}

export function writeEnginePreference(next: EnginePreference): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    // 存不上只是下次要重选一遍，不该打断正在做的事
    console.warn("[Engine] 引擎偏好写入失败", { action: "engine.writePreference", error });
  }
}

/**
 * CLI 状态检查的模块级短缓存。
 * 手动刷新走 force，仍然直连——用户点刷新就是想看真实状态。
 */
const PROVIDER_CACHE_TTL_MS = 60_000;
let providerCache: { at: number; providers: CliProviderStatus[] } | null = null;

export function peekCachedProviders(): CliProviderStatus[] | null {
  if (providerCache && Date.now() - providerCache.at < PROVIDER_CACHE_TTL_MS) {
    return providerCache.providers;
  }
  return null;
}

export async function loadProviders(force = false): Promise<CliProviderStatus[]> {
  if (!force) {
    const cached = peekCachedProviders();
    if (cached) return cached;
  }
  const data = await getImageProviders();
  providerCache = { at: Date.now(), providers: data.providers };
  return data.providers;
}

/** 选中的引擎不可用时换一个能用的；一个都没有就维持原样，让卡片上的原因自己说话。 */
export function pickUsableProvider(
  list: CliProviderStatus[],
  current: ImageCliProvider,
): ImageCliProvider {
  const chosen = list.find((item) => item.id === current);
  if (chosen?.available && chosen.authenticated) return current;
  return list.find((item) => item.available && item.authenticated)?.id || current;
}
