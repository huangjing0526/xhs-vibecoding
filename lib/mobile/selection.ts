const TOPIC_KEY = "vibenote.mobile.topicId";

/**
 * 跨页记住「用户正在处理哪篇笔记」。
 *
 * 移动端每个能力是独立路由，从作品列表点「做封面」时得把选中的笔记带过去。
 * 走 sessionStorage 而不是 query string：能力页刷新后也还在，且不用为
 * useSearchParams 包 Suspense。
 */
export function rememberTopic(topicId: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(TOPIC_KEY, topicId);
}

export function recallTopic(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TOPIC_KEY);
}
