/**
 * 「最近使用」：本机偏好，不进飞书。
 * 只记 id 与时间戳，标签和缩略图渲染时再从能力目录 / 模板库查——
 * 存快照会在改名后留下一堆过期文案。
 */

export const RECENT_STORAGE_KEY = "vibenote.recent.v1";

/** 最多留几条：一行摆得下就够，再多就该去目录里找。 */
const MAX_RECENT = 6;

export type RecentKind = "area" | "template";

export interface RecentEntry {
  kind: RecentKind;
  id: string;
  at: number;
}

function isEntry(value: unknown): value is RecentEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<RecentEntry>;
  return (entry.kind === "area" || entry.kind === "template") && typeof entry.id === "string";
}

export function readRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch (error) {
    console.warn("[RecentUsed] 最近使用读取失败", { action: "recentUsed.read", error });
    return [];
  }
}

/** 写入并返回新列表：同一条重复使用只更新时间并提到最前，不堆重复项。 */
export function pushRecent(kind: RecentKind, id: string): RecentEntry[] {
  const next = [{ kind, id, at: Date.now() }, ...readRecent().filter((item) => !(item.kind === kind && item.id === id))]
    .slice(0, MAX_RECENT);
  if (typeof window === "undefined") return next;
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("[RecentUsed] 最近使用写入失败", { action: "recentUsed.push", kind, id, error });
  }
  return next;
}
