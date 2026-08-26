import { AREAS, type AreaId } from "@/lib/capabilities";

/**
 * 首页输入框的意图路由：一句自然语言 → 落到哪个区。
 * 只做「去哪儿」这一件事，不生成任何内容——真正的活由目标区自己的入口做。
 */

export interface IntentResult {
  area: AreaId;
  /** 一句话说明为什么这么判，直接展示给用户，让路由可解释、可纠正。 */
  reason: string;
  /** 一句话复述「这次要做什么」，带进目标工具当起手参数；判不出来就是原话。 */
  brief: string;
  /** 原话里的第一个链接。以 URL 起步的工具（链接拆片）直接拿它填输入框；没有就是空串。 */
  url: string;
}

/** 可被路由到的区。结构页（首页/目录/笔记详情）不在其中——它们不是「要做的事」。 */
export const ROUTABLE_AREAS: AreaId[] = [
  "projects",
  "library",
  "assets",
  "images",
  "templates",
  "video",
  "videoFactory",
  "extract",
  "watermark",
  "rewrite",
  "blogger",
  "quality",
  "review",
];

export const DEFAULT_INTENT_AREA: AreaId = "projects";

/**
 * 兜底关键词规则：没配 AI 时它就是全部逻辑，配了 AI 时它是解析失败的下限。
 * 顺序即优先级——越靠前越具体，先命中先返回。
 */
const RULES: Array<{ area: AreaId; keywords: string[] }> = [
  { area: "extract", keywords: ["链接", "url", "拆片", "扒", "抖音链接", "下载视频", "提取"] },
  { area: "watermark", keywords: ["水印", "去水印"] },
  { area: "blogger", keywords: ["对标", "拆解", "博主", "道库", "同行"] },
  { area: "videoFactory", keywords: ["视频", "出片", "分镜", "短视频", "口播", "带货"] },
  { area: "assets", keywords: ["模特库", "产品库", "场景库", "资产库", "存进库"] },
  { area: "images", keywords: ["图", "封面", "配图", "电商图", "模特", "抠", "海报"] },
  { area: "templates", keywords: ["模板", "套图", "同款"] },
  { area: "rewrite", keywords: ["改写", "优化", "爆款", "润色", "标题"] },
  { area: "quality", keywords: ["质检", "检查", "违规", "能发吗", "发布前"] },
  { area: "review", keywords: ["复盘", "数据", "效果", "阅读量", "涨粉"] },
  { area: "library", keywords: ["素材", "攒料", "选题", "灵感", "导入"] },
  { area: "projects", keywords: ["笔记", "写", "草稿", "正文", "文案"] },
];

/**
 * 链接一律本地正则抠，不问模型：URL 错一个字符就打不开，
 * 而模型复述长链接时截断、补全、改大小写都发生过。中文标点收尾也要当作边界。
 */
const URL_PATTERN = /https?:\/\/[^\s，。、；："'）)】》]+/;

export function extractUrl(text: string): string {
  return text.match(URL_PATTERN)?.[0] || "";
}

/** 关键词兜底：命中就返回，全不命中回到项目页，让人自己挑一篇笔记。 */
export function routeByKeyword(text: string): IntentResult {
  const normalized = text.toLowerCase();
  const shared = { brief: text, url: extractUrl(text) };
  for (const rule of RULES) {
    const hit = rule.keywords.find((keyword) => normalized.includes(keyword));
    if (hit) return { ...shared, area: rule.area, reason: `按关键词「${hit}」判断` };
  }
  return { ...shared, area: DEFAULT_INTENT_AREA, reason: "没看出具体要做什么，先来项目页挑一篇笔记" };
}

export function buildIntentPrompt(text: string): string {
  const options = ROUTABLE_AREAS.map((id) => `- ${id}：${AREAS[id].label}，${AREAS[id].subtitle}`).join("\n");
  return `你是内容生产工作台的路由员。用户说了一句话，你要判断他想去哪个功能区。

可选功能区：
${options}

用户输入：
"""
${text}
"""

只输出 JSON，不要任何解释文字：
{"area":"上面列表里的一个 id","reason":"不超过 20 字，说明为什么去这个区","brief":"不超过 40 字，把他要做的事说成一句可执行的要求"}

判断规则：
- 只选列表里出现过的 id，拿不准就选 projects。
- reason 用中文，直接对用户说话，不要复述他的原话。
- brief 是要带进工具里当起手参数的，只写「要做成什么」，不要写链接、不要写寒暄。`;
}

/** 归一化模型输出：只兜「不是合法区」这一种错，兜不住就退回关键词规则。 */
export function normalizeIntent(raw: Partial<IntentResult> | null | undefined, text: string): IntentResult {
  const area = raw?.area;
  if (!area || !ROUTABLE_AREAS.includes(area)) return routeByKeyword(text);
  const reason = typeof raw?.reason === "string" ? raw.reason.trim() : "";
  const brief = typeof raw?.brief === "string" ? raw.brief.trim() : "";
  return {
    area,
    reason: reason || `已按「${AREAS[area].label}」打开`,
    brief: brief || text,
    url: extractUrl(text),
  };
}
