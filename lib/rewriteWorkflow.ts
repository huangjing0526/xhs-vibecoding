import type { BloggerDistillation } from "./bloggerWorkflow";
import type { ContentCard, DraftNote } from "./xhsWorkflow";

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
  };
}

export function draftToRewriteInput(draft: DraftNote): RewriteInput {
  return {
    sourceType: "draft",
    sourceId: draft.noteId || draft.recordId,
    title: draft.title,
    content: draft.content,
    reusableAsset: draft.imageSuggestions,
  };
}

function getIntensityLabel(intensity: RewriteIntensity): string {
  if (intensity === "light") return "轻改";
  if (intensity === "deep") return "重构";
  return "中改";
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
      `${getIntensityLabel(intensity)}：保留原素材事实，只调整进入角度和表达顺序。`,
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
