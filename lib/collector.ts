/**
 * 本地采集服务的调用封装（app 侧只做代理，不含任何抓取逻辑）。
 *
 * 与 `/api/video/extract` → `services/video-renderer` 同一模式：
 * 抓取依赖 Playwright / 用户登录态，Cloudflare Workers 跑不了，所以放本地服务。
 */

import { UserFacingError } from "./errors";
import { nowTimestampText } from "./feishu";
import { BLOGGER_STATUS, type BloggerNote, type BloggerProfile } from "./bloggerWorkflow";
import { VIDEO_PLATFORM_LABEL, type VideoPlatform } from "./videoExtract";
import type { ViralMetrics } from "./viralSignals";

const COLLECTOR_URL = process.env.BLOGGER_COLLECTOR_URL || "http://localhost:8788";

/**
 * 可采集的平台 = 拆片支持的平台去掉 unknown。
 * 复用 `VideoPlatform` 而不是另立一套：平台标签会写进飞书「平台」列，
 * 两套词汇漂移会让同一个平台在同一份数据里出现两个名字。
 */
export type CollectPlatform = Exclude<VideoPlatform, "unknown">;

export const COLLECT_PLATFORMS: CollectPlatform[] = ["xiaohongshu", "douyin", "tiktok"];

export const COLLECT_PLATFORM_LABEL: Record<CollectPlatform, string> = VIDEO_PLATFORM_LABEL;

export function isCollectPlatform(value: unknown): value is CollectPlatform {
  return COLLECT_PLATFORMS.includes(value as CollectPlatform);
}

/**
 * 平台非法时给用户看的提示。从 COLLECT_PLATFORMS 派生而不是写死中文，
 * 否则加平台时会漏改这句话，用户被告知一个真实存在的选项「不支持」。
 */
export const COLLECT_PLATFORM_HINT = `请选择平台（当前支持${COLLECT_PLATFORMS.map(
  (value) => COLLECT_PLATFORM_LABEL[value]
).join(" / ")}）`;

/** 采集服务返回的账号信息（原始契约，尚未套上飞书字段） */
interface RawProfile {
  platform?: string;
  homeUrl?: string;
  creatorId?: string;
  name?: string;
  bio?: string;
  followers?: number | null;
  noteCount?: number | null;
}

interface RawNote {
  noteId?: string;
  title?: string;
  content?: string;
  tags?: string[];
  coverDescription?: string;
  url?: string;
  publishedAt?: string;
  authorName?: string;
  metrics?: Record<string, number | null | undefined>;
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/**
 * 调本地采集服务。连不上时给中文可操作提示而不是抛栈——
 * 这是最常见的失败（服务没起），照抄 `/api/video/extract` 的处理方式。
 */
async function callCollector<T>(path: string, body: unknown, action: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${COLLECTOR_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("[collector] 无法连接本地采集服务", {
      userId: "local",
      tenantId: "local",
      action,
      collectorUrl: COLLECTOR_URL,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `无法连接本地采集服务（${COLLECTOR_URL}）。请先在 services/collector 运行 python3 server.py，详见该目录 README。`
    );
  }

  let payload: (T & { error?: string }) | null;
  try {
    payload = await response.json();
  } catch (error) {
    console.error("[Collector] Invalid JSON response", { userId: "local", tenantId: "local", action, status: response.status, error });
    throw new Error("采集服务返回了非 JSON 响应，请检查本地服务日志");
  }
  if (!response.ok || !payload || payload.error) {
    const message = payload?.error || `采集服务返回异常（${response.status}）`;
    console.error("[Collector] Request failed", { userId: "local", tenantId: "local", action, status: response.status, message });
    // 采集服务用 400 表示「要用户去改配置或换链接」，原样保留这个语义，别都压成 500
    throw response.status === 400 ? new UserFacingError(message) : new Error(message);
  }
  return payload;
}

function normalizeMetrics(raw: RawNote["metrics"]): ViralMetrics {
  return {
    // views 不在这里兜底成 0：小红书/抖音不公开阅读量，缺席是事实而非丢字段，
    // 让 viralSignals 的兜底走「按互动总量排序」那一档。
    views: num(raw?.views),
    likes: num(raw?.likes),
    saves: num(raw?.saves),
    comments: num(raw?.comments),
    shares: num(raw?.shares),
  };
}

function toProfile(
  raw: RawProfile,
  platform: CollectPlatform,
  homeUrl: string,
  lastCollectedAt = ""
): BloggerProfile {
  const creatorId = str(raw.creatorId);
  return {
    id: creatorId || homeUrl,
    // 拿不到昵称就存空——空即「未知」，占位文案是展示层的事，别把它当数据落库
    name: str(raw.name),
    platform: COLLECT_PLATFORM_LABEL[platform],
    // 采集服务会把链接规范成主页形态（TikTok 允许粘视频页地址），拿不到就用用户粘的原文
    homepageUrl: str(raw.homeUrl) || homeUrl,
    positioning: "",
    bio: str(raw.bio),
    followers: num(raw.followers),
    noteCount: num(raw.noteCount),
    status: lastCollectedAt ? BLOGGER_STATUS.collected : BLOGGER_STATUS.pending,
    lastCollectedAt,
  };
}

function toNote(raw: RawNote, bloggerId: string): BloggerNote {
  const noteId = str(raw.noteId);
  return {
    id: noteId,
    noteId,
    bloggerId,
    title: str(raw.title),
    content: str(raw.content),
    tags: Array.isArray(raw.tags) ? raw.tags.map(str).filter(Boolean) : [],
    coverDescription: str(raw.coverDescription),
    url: str(raw.url),
    publishedAt: str(raw.publishedAt),
    metrics: normalizeMetrics(raw.metrics),
  };
}

export async function collectProfile(platform: CollectPlatform, homeUrl: string): Promise<BloggerProfile> {
  const data = await callCollector<{ profile?: RawProfile }>(
    "/profile",
    { platform, homeUrl },
    "blogger.collectProfile"
  );
  return toProfile(data.profile || {}, platform, homeUrl);
}

export async function collectNotes(
  platform: CollectPlatform,
  homeUrl: string,
  limit?: number
): Promise<{ profile: BloggerProfile; notes: BloggerNote[] }> {
  const data = await callCollector<{ profile?: RawProfile; notes?: RawNote[] }>(
    "/notes",
    { platform, homeUrl, limit },
    "blogger.collectNotes"
  );

  const profile = toProfile(data.profile || {}, platform, homeUrl, nowTimestampText());
  const notes = (data.notes || []).map((raw) => toNote(raw, profile.id)).filter((note) => note.noteId);
  return { profile, notes };
}
