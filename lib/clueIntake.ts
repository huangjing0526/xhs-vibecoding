/**
 * 线索采集（阶段 C）：X / GitHub / 通用网页的公开线索 → 提炼成素材候选。
 *
 * 运行在服务端 API 路由里，只用 Web `fetch`（兼容 Cloudflare Workers），不依赖 Node API、不自研爬虫。
 * - GitHub：走公开 REST API 取仓库描述 + README，或 Issue 标题正文，最稳。
 * - X / 网页：通用 fetch + 正则抽正文；X 受限时正文可能很薄，交给上层优雅降级。
 * 输出落到现有素材结构（event/method/pitfall/relatedTerm），不新增飞书表。
 */

export type ClueSourceType = "github" | "x" | "web";

/** AI/规则提炼出的原始线索（不含来源标签，由路由统一回填） */
export interface ExtractedClue {
  /** 核心事件 */
  event: string;
  /** 可复用方法/结论 */
  method: string;
  /** 踩坑/痛点 */
  pitfall?: string;
  /** 相关术语 */
  relatedTerm?: string;
}

/** 抓取到的原文 */
export interface ClueFetchResult {
  sourceType: ClueSourceType;
  title: string;
  text: string;
  /** 正文为空时的来源专属降级提示（由抓取层定义，路由只负责透出） */
  emptyHint: string;
}

export const CLUE_SOURCE_LABEL: Record<ClueSourceType, string> = {
  github: "GitHub",
  x: "X",
  web: "网页",
};

/** 抓取正文上限，控制 prompt 体积 */
const MAX_CLUE_TEXT = 6000;

export function detectClueSource(url: string): ClueSourceType {
  if (/(?:^|\/\/)(?:www\.)?github\.com\//i.test(url)) return "github";
  if (/(?:^|\/\/)(?:www\.)?(?:x\.com|twitter\.com)\//i.test(url)) return "x";
  return "web";
}

function clip(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

/** 只负责剥标签，归一化与截断统一交给 clip 收口 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
}

function parseGithubUrl(url: string): { owner: string; repo: string; issue?: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/?#]+)(?:\/issues\/(\d+))?/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, ""), issue: match[3] };
}

function githubHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = process.env.GITHUB_TOKEN?.trim();
  return {
    "User-Agent": "xhs-vibecoding-clue-intake",
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function fetchGithub(url: string): Promise<{ title: string; text: string }> {
  const gh = parseGithubUrl(url);
  if (!gh) throw new Error("无法识别的 GitHub 链接，请粘贴仓库或 Issue 地址");

  if (gh.issue) {
    const res = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/issues/${gh.issue}`, {
      headers: githubHeaders(),
    });
    if (!res.ok) throw new Error(`GitHub Issue 抓取失败（${res.status}），可改为直接粘贴正文`);
    const data = (await res.json()) as { title?: string; body?: string };
    const title = `${gh.repo} #${gh.issue} ${data.title || ""}`.trim();
    return { title, text: clip(`${data.title || ""}\n\n${data.body || ""}`, MAX_CLUE_TEXT) };
  }

  // 仓库信息与 README 互不依赖，并行抓省一个往返
  const [repoRes, readmeRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}`, { headers: githubHeaders() }),
    fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/readme`, {
      headers: githubHeaders({ Accept: "application/vnd.github.raw" }),
    }),
  ]);
  if (!repoRes.ok) throw new Error(`GitHub 仓库抓取失败（${repoRes.status}），可改为直接粘贴正文`);
  const repoData = (await repoRes.json()) as { full_name?: string; description?: string };
  const readme = readmeRes.ok ? await readmeRes.text() : "";

  const title = repoData.full_name || `${gh.owner}/${gh.repo}`;
  const text = clip([title, repoData.description || "", readme].filter(Boolean).join("\n\n"), MAX_CLUE_TEXT);
  return { title, text };
}

async function fetchWeb(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`网页抓取失败（${res.status}），可改为直接粘贴正文`);
  const html = await res.text();
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
  return { title, text: clip(htmlToText(html), MAX_CLUE_TEXT) };
}

/** 按链接类型抓取正文，并按来源给出抓空时的降级提示 */
export async function fetchClueContent(url: string): Promise<ClueFetchResult> {
  const sourceType = detectClueSource(url);
  const { title, text } = sourceType === "github" ? await fetchGithub(url) : await fetchWeb(url);
  const emptyHint =
    sourceType === "x"
      ? "没抓到 X 正文（X 对抓取限制较多），请直接把帖子文字粘进来"
      : "没抓到正文内容，请改为直接粘贴原文";
  return { sourceType, title, text, emptyHint };
}

export function buildClueExtractionPrompt(text: string, sourceType: ClueSourceType): string {
  return `你在帮一个面向产品经理、独立开发者、AI Coding 新手的小红书账号采集选题线索。

下面是一条来自「${CLUE_SOURCE_LABEL[sourceType]}」的公开线索原文，请从中提炼 1-3 条「素材候选」。
每条素材要能沉淀成可复用的做法/结论，宁缺毋滥，原文里没有的不要编。

原文：
${text}

请只返回 JSON 数组，不要解释。格式：
[
  {
    "event": "核心事件，一句话说清这条线索讲了什么",
    "method": "从中能沉淀出的可复用方法/结论",
    "pitfall": "相关的踩坑/痛点（没有就留空）",
    "relatedTerm": "相关术语（没有就留空）"
  }
]`;
}

/** 未配置 AI 时的规则兜底：原样抓住线索作为待提炼素材，方法留人工补。 */
export function createFallbackClues(text: string, sourceType: ClueSourceType): ExtractedClue[] {
  const event = clip(text, 120);
  if (!event) return [];
  return [
    {
      event,
      method: `（未配置 AI，已原样抓取自${CLUE_SOURCE_LABEL[sourceType]}，请手动提炼可复用方法）`,
      pitfall: "",
      relatedTerm: "",
    },
  ];
}
