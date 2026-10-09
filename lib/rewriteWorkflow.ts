import type { BloggerDistillation } from "./bloggerWorkflow";
import { TITLE_STRUCTURE_LABEL, TITLE_STRUCTURE_SIGNAL } from "./contentStrategy";
import { HOOK_REQUIREMENT, resolveTitleStructure, titleQualityPenalty } from "./qualityCheck";
import {
  BODY_MAX_CHARS,
  cleanGeneratedBody,
  cleanGeneratedTitle,
  unknownToText,
  unknownToTextList,
  type ContentCard,
  type DraftNote,
  type ViralTitleStructure,
} from "./xhsWorkflow";

export type RewriteSourceType = "topic" | "draft" | "manual";
export type RewriteTarget = "title" | "content" | "structure" | "full";
export type RewriteIntensity = "light" | "medium" | "deep";

export interface RewriteInput {
  sourceType: RewriteSourceType;
  sourceId?: string;
  title: string;
  content: string;
  painPoint?: string;
  reusableAsset?: string;
  coreViewpoint?: string;
  /** 质检按它判标题；改写时得朝同一个结构写，否则改完还是过不了 */
  titleStructure?: ViralTitleStructure;
}

export interface RewriteResult {
  id: string;
  sourceType: RewriteSourceType;
  sourceId?: string;
  bloggerDistillationId?: string;
  target: RewriteTarget;
  intensity: RewriteIntensity;
  titles: string[];
  content: string;
  structureNotes: string[];
  hitDao: string;
  risks: string[];
}

function clip(text: string | undefined, maxLength: number): string {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return Array.from(normalized).slice(0, maxLength).join("");
}

export function topicToRewriteInput(topic: ContentCard): RewriteInput {
  return {
    sourceType: "topic",
    sourceId: topic.topicId || topic.recordId,
    title: topic.titleCandidates[0] || topic.coreViewpoint || topic.topicId,
    content: topic.outline.join("\n") || topic.coreViewpoint,
    painPoint: topic.painPoint,
    reusableAsset: topic.reusableAsset,
    coreViewpoint: topic.coreViewpoint,
    titleStructure: topic.viralTitleStructure,
  };
}

/** 草稿本身不带痛点和观点，从它的选题补上；标题结构取法与质检一致（草稿优先）。 */
export function draftToRewriteInput(draft: DraftNote, topic: ContentCard | null): RewriteInput {
  return {
    sourceType: "draft",
    sourceId: draft.noteId || draft.recordId,
    title: draft.title,
    content: draft.content,
    painPoint: topic?.painPoint,
    coreViewpoint: topic?.coreViewpoint,
    reusableAsset: topic?.reusableAsset || draft.imageSuggestions,
    titleStructure: resolveTitleStructure(draft, topic),
  };
}

/** 强度的界面标签与写给模型的规则放一处，改名不会只改到一边。 */
const INTENSITY: Record<RewriteIntensity, { label: string; rule: string }> = {
  light: { label: "轻改", rule: "保留原句式，只修表达和节奏。" },
  medium: { label: "中改", rule: "保留事实与观点，换进入角度和表达顺序。" },
  deep: { label: "重构", rule: "保留事实与观点，从开头钩子到结尾整体重写。" },
};

const TARGET_RULE: Record<RewriteTarget, string> = {
  title: "只改标题，正文原样返回。",
  content: "只改正文，标题给 3 个微调版本即可。",
  structure: "保留观点和事实，重排正文结构与段落顺序，标题给 3 个微调版本。",
  full: "标题和正文都重写。",
};

export function isRewriteTarget(value: unknown): value is RewriteTarget {
  return typeof value === "string" && value in TARGET_RULE;
}

export function isRewriteIntensity(value: unknown): value is RewriteIntensity {
  return typeof value === "string" && value in INTENSITY;
}

export function createFallbackRewrite(
  input: RewriteInput,
  distillation: BloggerDistillation | null,
  target: RewriteTarget,
  intensity: RewriteIntensity
): RewriteResult {
  const painPoint = clip(input.painPoint || input.coreViewpoint || input.content, 24) || "这件事";
  const asset = clip(input.reusableAsset || input.content, 28) || "一套可复用方法";
  const subject = clip(input.title || input.coreViewpoint || painPoint, 22) || "这条内容";
  const daoTitle = distillation?.coreDao || "用具体场景、反差判断和可收藏资产提升内容密度。";

  const titles = [
    `别急着写 ${subject}，先看问题卡在哪`,
    `真正影响 ${subject} 的，不是工具，是判断顺序`,
    `我把 ${painPoint} 拆成了一张可复用清单`,
  ];

  const content =
    target === "title"
      ? input.content
      : `这次最值得写的，不是“我做了什么”，而是 ${painPoint}。\n\n如果直接写，很容易变成流水账。更稳的写法是先给读者一个判断入口：他是不是也卡在同一个位置。\n\n可直接收藏的结构：\n1. 先说卡点\n2. 再讲真实场景\n3. 拆出误区\n4. 给出 ${asset}\n5. 用一个真实问题收尾。`;

  return {
    id: `rewrite-${Date.now().toString(36)}`,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    bloggerDistillationId: distillation?.id,
    target,
    intensity,
    titles,
    content,
    structureNotes: [
      `${INTENSITY[intensity].label}：保留原素材事实，只调整进入角度和表达顺序。`,
      "开头先抛读者处境，再进入真实案例。",
      "结尾直接给结构化资产，不做私域引导。",
    ],
    hitDao: distillation
      ? `命中道：${clip(daoTitle, 42)}`
      : "命中道：默认使用具体场景 + 反差判断 + 可收藏资产。",
    risks: [
      "需要人工确认是否有借用外部博主原句。",
      "素材里没有的数据、收益和规模不能补写。",
      "如果用于发布，标题需要再检查是否过度夸张。",
    ],
  };
}

export function buildRewritePrompt(
  input: RewriteInput,
  distillation: BloggerDistillation | null,
  target: RewriteTarget,
  intensity: RewriteIntensity
): string {
  const dao = distillation
    ? [
        `核心道：${distillation.coreDao}`,
        distillation.titlePatterns.length ? `标题句式：${distillation.titlePatterns.join("；")}` : "",
        distillation.contentPatterns.length ? `正文结构：${distillation.contentPatterns.join("；")}` : "",
        distillation.toneRules.length ? `语气：${distillation.toneRules.join("；")}` : "",
        distillation.boundaries.length ? `边界：${distillation.boundaries.join("；")}` : "",
      ].filter(Boolean).join("\n")
    : "";
  const context = [
    input.painPoint ? `读者痛点：${input.painPoint}` : "",
    input.coreViewpoint ? `核心观点：${input.coreViewpoint}` : "",
    input.reusableAsset ? `可收藏资产：${input.reusableAsset}` : "",
    input.titleStructure ? `标题结构：${TITLE_STRUCTURE_LABEL[input.titleStructure]}，3 个标题都${TITLE_STRUCTURE_SIGNAL[input.titleStructure]}` : "",
  ].filter(Boolean).join("\n");

  return `你在改写一篇中文小红书笔记。

改写范围：${TARGET_RULE[target]}
改写强度：${INTENSITY[intensity].label}——${INTENSITY[intensity].rule}

硬性要求：
- 不许编造原文没有的数据、收益、时间和规模。
- 不要营销腔，不要「点赞收藏」「评论区扣1」「私发」「领取」这类话术。
- 正文不超过 ${BODY_MAX_CHARS} 个中文字符，前 3 行要有具体场景、反差或结果。
- 标题 8–24 字，不要在原标题前面硬加前缀。
- ${HOOK_REQUIREMENT}。
${context ? `\n这篇笔记的要点：\n${context}\n` : ""}${dao ? `\n对标道库（学它的写法，不照搬原句）：\n${dao}\n` : ""}
原标题：${input.title}

原正文：
${input.content}

只返回 JSON，不要解释：
{
  "titles": ["标题1", "标题2", "标题3"],
  "content": "改写后的正文",
  "structureNotes": ["这次怎么改的，2-3 条"],
  "hitDao": "命中了哪条道，一句话",
  "risks": ["发布前要人工确认的点"]
}`;
}

/**
 * 模型结果落成 RewriteResult：缺字段用 fallback 补；标题按质检的标题两项排序，
 * 最可能放行的排第一个——「应用到草稿」默认取的就是第一个。
 */
export function normalizeRewriteResult(
  raw: Partial<RewriteResult>,
  input: RewriteInput,
  fallback: RewriteResult
): RewriteResult {
  // sort 是稳定的：同分时保留模型给的先后
  const titles = unknownToTextList(raw.titles, [])
    .map((title) => cleanGeneratedTitle(title, input.title))
    .map((title) => ({ title, penalty: titleQualityPenalty(title, input.titleStructure) }))
    .sort((a, b) => a.penalty - b.penalty)
    .map((item) => item.title);

  return {
    ...fallback,
    titles: titles.length ? titles : fallback.titles,
    content: fallback.target === "title" ? input.content : cleanGeneratedBody(unknownToText(raw.content), input.content),
    structureNotes: unknownToTextList(raw.structureNotes, fallback.structureNotes),
    hitDao: unknownToText(raw.hitDao, fallback.hitDao),
    risks: unknownToTextList(raw.risks, fallback.risks),
  };
}
