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
 * 引擎探测的模块级短缓存。
 *
 * 一次探测要 spawn 好几个 CLI 子进程、还带联网请求，而结果在一次会话里几乎不变；
 * 首页、图片工厂、视频工厂各自 mount 时都要探一次，不缓存就是纯白等。
 * 手动刷新走 force，仍然直连——用户点刷新就是想看真实状态。
 *
 * 缓存的是 Promise 而不是结果：同一瞬间两个组件一起 mount 时，第二个直接复用在途请求。
 */
const PROVIDER_CACHE_TTL_MS = 60_000;

interface ProbeEntry {
  at: number;
  inflight: Promise<unknown>;
  /** 已经拿到的结果。同步取用（首屏初值）要靠它——Promise 里的值同步读不出来 */
  value?: unknown;
}

const probeCache = new Map<string, ProbeEntry>();

function freshEntry(key: string): ProbeEntry | null {
  const hit = probeCache.get(key);
  return hit && Date.now() - hit.at < PROVIDER_CACHE_TTL_MS ? hit : null;
}

export async function cachedProbe<T>(key: string, fetcher: () => Promise<T>, force = false): Promise<T> {
  const hit = force ? null : freshEntry(key);
  if (hit) return hit.inflight as Promise<T>;

  const entry: ProbeEntry = { at: Date.now(), inflight: Promise.resolve() };
  entry.inflight = fetcher().then((value) => {
    entry.value = value;
    return value;
  });
  probeCache.set(key, entry);
  // 失败的探测不该被缓存住，否则一次网络抖动要闷 60 秒
  entry.inflight.catch(() => probeCache.delete(key));
  return entry.inflight as Promise<T>;
}

/** 同步偷看已缓存的图片引擎状态，用于首屏初值；没有就返回 null，照常异步拉。 */
export function peekCachedProviders(): CliProviderStatus[] | null {
  return (freshEntry("image")?.value as CliProviderStatus[] | undefined) ?? null;
}

export async function loadProviders(force = false): Promise<CliProviderStatus[]> {
  return cachedProbe("image", async () => (await getImageProviders()).providers, force);
}

/**
 * 选中的引擎不可用时换一个能用的；一个都没有就维持原样，让卡片上的原因自己说话。
 * 泛型是为了让视频线共用——两条线的 id 联合不同，但「可不可用」的判断完全一样。
 */
export function pickUsableProvider<T extends string>(
  list: Array<{ id: T; available: boolean; authenticated: boolean }>,
  current: T,
): T {
  const chosen = list.find((item) => item.id === current);
  if (chosen?.available && chosen.authenticated) return current;
  return list.find((item) => item.available && item.authenticated)?.id || current;
}
