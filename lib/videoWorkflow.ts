import type { BloggerDistillation } from "./bloggerWorkflow";
import { unknownToText, type ContentCard, type DraftNote } from "./xhsWorkflow";

export type VideoSourceType = "topic" | "draft" | "manual";
export type VideoFormat = "talking_head" | "flash_cards" | "screen_recording" | "story";
export type VideoPace = "steady" | "fast";
export type VideoDuration = "30s" | "60s" | "90s";

export interface VideoSourceInput {
  sourceType: VideoSourceType;
  sourceId?: string;
  title: string;
  content: string;
  painPoint?: string;
  reusableAsset?: string;
  coreViewpoint?: string;
}

export interface VideoPlan {
  id: string;
  sourceType: VideoSourceType;
  sourceId?: string;
  format: VideoFormat;
  duration: VideoDuration;
  pace: VideoPace;
  title: string;
  hook: string;
  voiceover: string;
  scenes: Array<{
    order: number;
    visual: string;
    subtitle: string;
    durationHint: string;
  }>;
  coverText: string;
  generationPrompt: string;
}

export interface VideoRenderRequest {
  plan: VideoPlan;
  /** edge-tts 音色，默认 zh-CN-XiaoxiaoNeural */
  voice?: string;
  /** SSML 语速，如 "+18%"；不传时按 plan.pace 推断 */
  rate?: string;
  /** 可选：复用图片生成环节的封面/笔记图 URL，作为各屏背景 */
  imageUrls?: string[];
}

export interface VideoRenderResult {
  id: string;
  videoUrl: string;
  durationSec: number;
}

export type VideoRenderStatus = "idle" | "rendering" | "done" | "error";

function clip(text: string | undefined, maxLength: number): string {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return Array.from(normalized).slice(0, maxLength).join("");
}

export function topicToVideoSourceInput(topic: ContentCard): VideoSourceInput {
  return {
    sourceType: "topic",
    sourceId: topic.topicId || topic.recordId,
    title: topic.titleCandidates[0] || topic.coreViewpoint || topic.topicId,
    content: [topic.coreViewpoint, topic.realCase, topic.reusableAsset].filter(Boolean).join("\n"),
    painPoint: topic.painPoint,
    reusableAsset: topic.reusableAsset,
    coreViewpoint: topic.coreViewpoint,
  };
}

/** 草稿本身不带痛点和观点，从它的选题补上 */
export function draftToVideoSourceInput(draft: DraftNote, topic: ContentCard | null): VideoSourceInput {
  return {
    sourceType: "draft",
    sourceId: draft.noteId || draft.recordId,
    title: draft.title,
    content: draft.content,
    painPoint: topic?.painPoint,
    coreViewpoint: topic?.coreViewpoint,
    reusableAsset: topic?.reusableAsset || draft.imageSuggestions,
  };
}

const FORMAT_NAME: Record<VideoFormat, string> = {
  talking_head: "口播",
  flash_cards: "图文快闪",
  screen_recording: "教程录屏",
  story: "剧情反差",
};
const DURATIONS: VideoDuration[] = ["30s", "60s", "90s"];
const PACES: VideoPace[] = ["steady", "fast"];

export function getFormatName(format: VideoFormat): string {
  return FORMAT_NAME[format];
}

export function isVideoFormat(value: unknown): value is VideoFormat {
  return typeof value === "string" && value in FORMAT_NAME;
}

export function isVideoDuration(value: unknown): value is VideoDuration {
  return DURATIONS.includes(value as VideoDuration);
}

export function isVideoPace(value: unknown): value is VideoPace {
  return PACES.includes(value as VideoPace);
}

export function createFallbackVideoPlan(
  input: VideoSourceInput,
  distillation: BloggerDistillation | null,
  format: VideoFormat,
  duration: VideoDuration,
  pace: VideoPace
): VideoPlan {
  const painPoint = clip(input.painPoint || input.coreViewpoint || input.content, 28) || "这个问题";
  const asset = clip(input.reusableAsset || input.content, 34) || "一套可复用做法";
  const title = clip(input.title || painPoint, 30) || "AI 实践复盘";
  const formatName = getFormatName(format);
  const paceText = pace === "fast" ? "快节奏" : "稳定节奏";
  const daoHint = distillation?.coreDao
    ? `参考道库：${clip(distillation.coreDao, 46)}`
    : "参考道库：具体场景 + 反差判断 + 可收藏资产";

  const scenes = [
    {
      order: 1,
      visual: "首屏大字 + 人物口播或标题卡",
      subtitle: `别急着做，先看 ${painPoint}`,
      durationHint: duration === "30s" ? "0-4s" : "0-6s",
    },
    {
      order: 2,
      visual: format === "screen_recording" ? "录屏展示原始任务或文档" : "问题拆解卡片",
      subtitle: "真正卡住的不是工具，而是判断顺序",
      durationHint: duration === "30s" ? "4-12s" : "6-20s",
    },
    {
      order: 3,
      visual: "三步结构图",
      subtitle: `可收藏：${asset}`,
      durationHint: duration === "30s" ? "12-22s" : "20-44s",
    },
    {
      order: 4,
      visual: "结尾问题卡",
      subtitle: "你更卡在选题，还是正文结构？",
      durationHint: duration === "30s" ? "22-30s" : duration === "60s" ? "44-60s" : "64-90s",
    },
  ];

  const voiceover = `开头：${painPoint}，很多人会直接找工具解决，但这一步通常会跑偏。\n\n中段：我会先把它拆成三个判断：场景是不是真实、读者能不能代入、最后能不能沉淀成一个可收藏动作。\n\n方法：这条内容可以按“卡点 -> 真实场景 -> 误区 -> ${asset} -> 讨论问题”来拍。\n\n结尾：你现在更卡在选题，还是正文结构？`;

  return {
    id: `video-${Date.now().toString(36)}`,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    format,
    duration,
    pace,
    title: `${title}｜${formatName}方案`,
    hook: `别急着写 ${clip(title, 16)}，先看问题卡在哪。`,
    voiceover,
    scenes,
    coverText: `真正卡住你的\n不是工具`,
    generationPrompt: [
      `生成一个 ${duration} 的小红书${formatName}视频方案，${paceText}。`,
      daoHint,
      `主题：${title}`,
      `核心痛点：${painPoint}`,
      `可收藏资产：${asset}`,
      "画面要求：浅色极简、文字少、每屏只保留一个判断点。",
      "不要编造素材里没有的数据、收益或团队规模。",
    ].join("\n"),
  };
}

export function buildVideoScriptPrompt(
  input: VideoSourceInput,
  distillation: BloggerDistillation | null,
  format: VideoFormat,
  duration: VideoDuration,
  pace: VideoPace
): string {
  const context = [
    input.painPoint ? `读者痛点：${input.painPoint}` : "",
    input.coreViewpoint ? `核心观点：${input.coreViewpoint}` : "",
    input.reusableAsset ? `可收藏资产：${input.reusableAsset}` : "",
    distillation?.coreDao ? `对标道库的核心道（学写法，不照搬）：${distillation.coreDao}` : "",
  ].filter(Boolean).join("\n");

  return `把下面这篇小红书笔记改成一条 ${duration} 的${FORMAT_NAME[format]}短视频脚本，${pace === "fast" ? "快节奏" : "稳定节奏"}。

要求：
- 开头 3 秒内给出具体场景、反差或结果，不要寒暄。
- 口播稿按时间顺序写，口语化，总时长贴合 ${duration}。
- 分镜 4–6 屏，每屏只讲一个判断点，字幕短到一眼能读完。
- 不许编造原文没有的数据、收益、时间和规模；不要营销腔和私域引导。
${context ? `\n${context}\n` : ""}
笔记标题：${input.title}

笔记正文：
${input.content}

只返回 JSON，不要解释：
{
  "title": "视频标题",
  "hook": "开头钩子一句话",
  "voiceover": "完整口播稿",
  "scenes": [{ "order": 1, "visual": "画面", "subtitle": "字幕", "durationHint": "0-5s" }],
  "coverText": "封面大字，可换行",
  "generationPrompt": "交给视频生成模型的整体画面提示词"
}`;
}

/** 模型结果落成 VideoPlan：id、来源、格式参数由这里定，缺的字段用规则版补，分镜不像样就整组用规则版。 */
export function normalizeVideoPlan(raw: Partial<VideoPlan>, fallback: VideoPlan): VideoPlan {
  const scenes = Array.isArray(raw.scenes)
    ? raw.scenes
        .map((scene, index) => ({
          order: index + 1,
          visual: unknownToText(scene?.visual),
          subtitle: unknownToText(scene?.subtitle),
          durationHint: unknownToText(scene?.durationHint),
        }))
        .filter((scene) => scene.visual || scene.subtitle)
    : [];
  return {
    ...fallback,
    title: unknownToText(raw.title, fallback.title),
    hook: unknownToText(raw.hook, fallback.hook),
    voiceover: unknownToText(raw.voiceover, fallback.voiceover),
    scenes: scenes.length ? scenes : fallback.scenes,
    coverText: unknownToText(raw.coverText, fallback.coverText),
    generationPrompt: unknownToText(raw.generationPrompt, fallback.generationPrompt),
  };
}
