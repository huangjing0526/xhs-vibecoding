/**
 * 视频拆片（AI 工具）：粘抖音/小红书视频链接 → 本地服务拉取无水印视频 + 口播脚本 → AI 拆解脚本结构。
 *
 * 抖音/小红书反爬强，且抓取要 yt-dlp / ffmpeg / whisper 这类本地二进制，Cloudflare Workers 跑不了，
 * 所以抓取全部放本地服务（services/video-renderer 的 /extract），本 app 侧只做代理 + AI 拆解。
 * 与「对标拆解」道库同源：拆出的结构可一键沉淀成 BloggerDistillation。
 */

import type { BloggerDistillation } from "./bloggerWorkflow";

export type VideoPlatform = "douyin" | "xiaohongshu" | "unknown";

export const VIDEO_PLATFORM_LABEL: Record<VideoPlatform, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  unknown: "未知平台",
};

/** 本地服务抓回来的原始视频（不含 AI 分析） */
export interface ExtractedVideo {
  platform: VideoPlatform;
  title: string;
  /** 平台自带文案（抖音 desc / 小红书正文） */
  desc: string;
  author: string;
  durationSec: number;
  /** 封面图地址 */
  coverUrl: string;
  /** 本地服务托管的无水印视频地址 */
  videoUrl: string;
  /** ASR 转写出的口播脚本；转写失败/未启用则为空 */
  transcript: string;
  /** 转写为空时的原因提示（未装 whisper / 未配 ASR 等），由抓取层给出 */
  transcriptNote: string;
}

/** AI 拆出的脚本结构里的一段 */
export interface ScriptStructureStage {
  /** 阶段名，如 钩子 / 痛点 / 干货 / 转折 / 行动号召 */
  stage: string;
  /** 这一段在整条脚本里的作用 */
  purpose: string;
  /** 对应的口播原文片段 */
  text: string;
}

/** AI 拆出的脚本结构 */
export interface ScriptAnalysis {
  /** 开头 3 秒的钩子是怎么设计的 */
  hook: string;
  /** 分段结构 */
  structure: ScriptStructureStage[];
  /** 语言 / 节奏 / 风格特征 */
  style: string;
  /** 抽象成可复用的脚本模板 */
  reusableTemplate: string;
  /** 戳中的读者痛点 */
  painPoint: string;
}

export interface VideoExtractResult {
  video: ExtractedVideo;
  analysis: ScriptAnalysis;
  usedFallback: boolean;
  provider: string;
}

export function detectVideoPlatform(url: string): VideoPlatform {
  if (/douyin\.com|iesdouyin\.com/i.test(url)) return "douyin";
  if (/xiaohongshu\.com|xhslink\.com/i.test(url)) return "xiaohongshu";
  return "unknown";
}

/** 从抖音/小红书的分享口令文本里抠出第一个链接；已经是纯链接就原样返回。 */
export function extractShareUrl(text: string): string | null {
  const match = (text || "").match(/https?:\/\/[^\s，。、】）)"']+/i);
  return match ? match[0] : null;
}

/**
 * 规范化到 yt-dlp 认得的视频 URL。
 * 抖音用户主页/搜索/发现等页面把视频开在弹窗里，真实 aweme_id 在 modal_id，
 * 这类页面 URL yt-dlp 直接报「Unsupported URL」，统一改写成 /video/<id> 规范形。
 */
export function normalizeVideoUrl(url: string): string {
  if (!url) return url;
  if (/douyin\.com/i.test(url)) {
    const modal = url.match(/[?&]modal_id=(\d+)/);
    if (modal) return `https://www.douyin.com/video/${modal[1]}`;
  }
  return url;
}

const MAX_TRANSCRIPT = 6000;

function clip(text: string, max: number): string {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  return Array.from(normalized).slice(0, max).join("");
}

export function buildScriptAnalysisPrompt(video: ExtractedVideo): string {
  const script = clip(video.transcript, MAX_TRANSCRIPT);
  const body = script || video.desc;
  return `你在帮一个做短视频的团队拆解对标视频的脚本结构。

平台：${VIDEO_PLATFORM_LABEL[video.platform]}
标题：${video.title || "（无）"}
平台文案：${video.desc || "（无）"}
口播脚本（ASR 转写，可能有错别字，请自行容错）：
${body || "（没抓到脚本，只能基于标题/文案推断）"}

请拆解这条视频的脚本结构，宁缺毋滥，原文里没有的不要编。只返回 JSON，不要解释。格式：
{
  "hook": "开头 3 秒的钩子是怎么设计的",
  "structure": [
    { "stage": "阶段名（如 钩子/痛点/干货/转折/行动号召）", "purpose": "这一段的作用", "text": "对应的口播原文片段" }
  ],
  "style": "语言、节奏、风格特征",
  "reusableTemplate": "抽象成一句话可复用的脚本模板",
  "painPoint": "戳中读者的什么痛点"
}`;
}

/** 未配置 AI 时的兜底：原样保留抓到的脚本/文案，结构留人工拆。 */
export function createFallbackScriptAnalysis(video: ExtractedVideo): ScriptAnalysis {
  const text = video.transcript || video.desc || video.title;
  return {
    hook: "",
    structure: text
      ? [{ stage: "全文", purpose: "（未配置 AI，已原样抓取，请手动拆解结构）", text: clip(text, 500) }]
      : [],
    style: "",
    reusableTemplate: "",
    painPoint: "",
  };
}

/** 把一次拆片结果映射成「对标拆解」道库条目，供一键沉淀。 */
export function scriptAnalysisToDistillation(
  video: ExtractedVideo,
  analysis: ScriptAnalysis
): BloggerDistillation {
  const slug = (video.author || "unknown").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "unknown";
  const nonEmpty = (items: string[]) => items.map((s) => s.trim()).filter(Boolean);
  return {
    id: `distill-video-${slug}-${Date.now().toString(36)}`,
    bloggerId: `video-${video.platform}-${slug}`,
    coreDao: analysis.reusableTemplate || analysis.hook || video.title,
    topicDao: nonEmpty([analysis.painPoint]),
    titlePatterns: nonEmpty([analysis.hook]),
    contentPatterns: nonEmpty(analysis.structure.map((s) => `${s.stage}：${s.purpose}`)),
    visualPatterns: [],
    toneRules: nonEmpty([analysis.style]),
    boundaries: ["拆自对标视频，迁移时用自己的真实素材替换具体案例，不照搬原句。"],
    adaptationNotes: nonEmpty([
      `来源：${VIDEO_PLATFORM_LABEL[video.platform]} @${video.author || "未知作者"}《${video.title || "无标题"}》`,
    ]),
  };
}
