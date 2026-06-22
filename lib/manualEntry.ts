import type { ContentCard, DraftNote, MaterialItem } from "./xhsWorkflow";

/**
 * 手动新增工厂：每一步都允许用户手动建一条，而不是必须从飞书/本地文档/上游自动生成导入。
 * 生成的条目带本地 id（local-* 前缀），与导入数据共用同一套 snapshot 字段，
 * 在 Demo 与 Connected 模式下都能直接注入选题/草稿/素材列表并参与后续生成。
 */

let manualCounter = 0;

function localId(prefix: string): string {
  manualCounter += 1;
  const random = Math.random().toString(36).slice(2, 7);
  return `local-${prefix}-${Date.now().toString(36)}-${manualCounter}-${random}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ManualMaterialInput {
  /** 核心事件（必填） */
  event: string;
  /** 可复用方法（必填） */
  method: string;
  /** 来源类型，默认「手动录入」 */
  sourceType?: string;
  /** 踩坑/痛点 */
  pitfall?: string;
  /** 相关术语 */
  relatedTerm?: string;
}

export function createManualMaterial(input: ManualMaterialInput): MaterialItem {
  const sourceType = input.sourceType?.trim() || "手动录入";
  return {
    recordId: localId("mat"),
    sourceId: `MANUAL-${manualCounter}`,
    sourceType,
    date: today(),
    summary: input.event.trim(),
    event: input.event.trim(),
    pitfall: input.pitfall?.trim() || "",
    method: input.method.trim(),
    relatedTerm: input.relatedTerm?.trim() || "",
    status: "待提炼",
  };
}

/** 编辑已有素材：保留 id/来源/日期/状态，仅覆盖可编辑字段。 */
export function applyMaterialEdit(item: MaterialItem, input: ManualMaterialInput): MaterialItem {
  return {
    ...item,
    sourceType: input.sourceType?.trim() || item.sourceType,
    summary: input.event.trim(),
    event: input.event.trim(),
    method: input.method.trim(),
    pitfall: input.pitfall?.trim() || "",
    relatedTerm: input.relatedTerm?.trim() || "",
  };
}

export interface ManualTopicInput {
  /** 标题（必填） */
  title: string;
  /** 核心观点（必填） */
  coreViewpoint: string;
  /** 读者痛点（必填） */
  painPoint: string;
  /** 目标读者 */
  targetReader?: string;
  /** 真实案例 */
  realCase?: string;
  /** 可收藏资产 */
  reusableAsset?: string;
}

export function createManualTopic(input: ManualTopicInput): ContentCard {
  const title = input.title.trim();
  return {
    topicId: localId("topic"),
    sourceMaterial: "手动录入",
    relatedTerm: "",
    column: "手动",
    targetReader: input.targetReader?.trim() || "",
    painPoint: input.painPoint.trim(),
    coreViewpoint: input.coreViewpoint.trim(),
    realCase: input.realCase?.trim() || "",
    reusableAsset: input.reusableAsset?.trim() || "",
    titleCandidates: [title],
    coverText: title,
    outline: [],
    commentPrompt: "",
    estimatedSaveValue: 3,
    status: "待写",
  };
}

/** 编辑已有选题：保留 id/来源/道库判定等，覆盖标题与正文要点字段。 */
export function applyTopicEdit(topic: ContentCard, input: ManualTopicInput): ContentCard {
  const title = input.title.trim();
  return {
    ...topic,
    titleCandidates: [title, ...topic.titleCandidates.slice(1)],
    coverText: topic.coverText || title,
    coreViewpoint: input.coreViewpoint.trim(),
    painPoint: input.painPoint.trim(),
    targetReader: input.targetReader?.trim() || "",
    realCase: input.realCase?.trim() || "",
    reusableAsset: input.reusableAsset?.trim() || "",
  };
}

export interface ManualDraftInput {
  /** 标题（必填） */
  title: string;
  /** 正文（必填，可整篇粘贴） */
  content: string;
  /** 关联选题 id */
  topicId?: string;
  /** 封面文案 */
  coverText?: string;
  /** 配图建议 */
  imageSuggestions?: string;
}

export function createManualDraft(input: ManualDraftInput): DraftNote {
  const title = input.title.trim();
  return {
    noteId: localId("note"),
    topicId: input.topicId?.trim() || "",
    title,
    coverText: input.coverText?.trim() || title,
    content: input.content.trim(),
    imageSuggestions: input.imageSuggestions?.trim() || "",
    tags: [],
    commentPrompt: "",
    status: "待发",
  };
}
