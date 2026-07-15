import type { CoverConfig } from "@/lib/cover";
import type { CoverInput, CoverPlan } from "@/lib/coverWorkflow";
import type {
  ContentImagePlan,
  ContentImageTemplateType,
  ImageAssetKind,
  ImageWorkflowSourceInput,
} from "@/lib/imageWorkflow";
import {
  MATERIAL_STATUS,
  TOPIC_STATUS,
  type ContentCard,
  type DraftNote,
  type GlossaryItem,
  type MaterialItem,
  type ReviewMetric,
  type ReviewResult,
} from "@/lib/xhsWorkflow";
import type { LocalDocCategory, LocalDocFileSummary } from "@/lib/localDocs";
import type { ExtractedClue } from "@/lib/clueIntake";

export interface WorkflowSnapshot {
  materials: MaterialItem[];
  glossary: GlossaryItem[];
  topics: ContentCard[];
  drafts: DraftNote[];
  metrics: ReviewMetric[];
}

export type WorkflowMode = "connected" | "demo";

export interface WorkflowBootstrapResult {
  mode: WorkflowMode;
  snapshot: WorkflowSnapshot | null;
  config: {
    feishuReady: boolean;
    missingFeishuConfig: string[];
    aiProvider: string;
    aiReady: boolean;
    localDocsSourceDir: string;
    topicPoolDir: string;
  };
}

interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

export interface ContentCardsResult {
  cards: ContentCard[];
  writeBack: boolean;
  usedFallback: boolean;
  provider: string;
}

export interface DraftsResult {
  drafts: DraftNote[];
  writeBack: boolean;
  usedFallback: boolean;
  provider: string;
}

export interface SaveDraftResult {
  draft: DraftNote;
  writeBack: boolean;
  writeResult: unknown;
}

export interface PublishDraftResult {
  draft: DraftNote;
  reviewMetric: ReviewMetric;
  writeBack: boolean;
  writeResult: unknown;
}

export interface CoverResult {
  input: CoverInput;
  plan: CoverPlan;
  coverConfig: CoverConfig;
  coverImageDataUrl?: string;
  writeBack: boolean;
  usedFallback: boolean;
  provider: string;
}

export interface ImageAssetResult {
  input: ImageWorkflowSourceInput;
  plan: ContentImagePlan;
  writeBack: boolean;
  usedFallback: boolean;
  provider: string;
}

export interface ReviewGenerationResult {
  review: ReviewResult;
  writeBack: boolean;
  usedFallback: boolean;
  provider: string;
}

export interface LocalDocsScanResult {
  sourceDir: string;
  categories: LocalDocCategory[];
  scannedFiles: number;
  files: LocalDocFileSummary[];
  materials: MaterialItem[];
  glossary: GlossaryItem[];
}

export interface LocalDocsSyncResult extends LocalDocsScanResult {
  writeBack: boolean;
  importedMaterials: MaterialItem[];
  importedGlossary: GlossaryItem[];
  skippedMaterials: number;
  skippedGlossary: number;
}

async function parseApiResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  let payload: ApiResponse<T>;

  try {
    payload = await response.json();
  } catch (error) {
    console.error("[WorkflowClient] 响应解析失败", {
      action: "parseApiResponse",
      error,
    });
    throw new Error(fallbackMessage);
  }

  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || fallbackMessage);
  }

  return payload.data;
}

async function workflowRequest<T>(
  url: string,
  options: RequestInit,
  fallbackMessage: string
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  return parseApiResponse<T>(response, fallbackMessage);
}

export async function syncWorkflowData(): Promise<WorkflowSnapshot> {
  const response = await fetch("/api/feishu/sync");
  return parseApiResponse<WorkflowSnapshot>(response, "飞书数据同步失败");
}

export async function getWorkflowBootstrap(): Promise<WorkflowBootstrapResult> {
  const response = await fetch("/api/workflow/bootstrap");
  return parseApiResponse<WorkflowBootstrapResult>(response, "工作流启动失败");
}

export type DeletableKind = "material" | "topic" | "draft";

const DELETE_FALLBACK: Record<DeletableKind, string> = {
  material: "素材删除失败",
  topic: "选题删除失败",
  draft: "草稿删除失败",
};

export async function deleteRecord(
  kind: DeletableKind,
  recordId: string
): Promise<{ kind: DeletableKind; recordId: string }> {
  return workflowRequest<{ kind: DeletableKind; recordId: string }>(
    "/api/feishu/records/delete",
    { method: "POST", body: JSON.stringify({ kind, recordId }) },
    DELETE_FALLBACK[kind]
  );
}

export async function saveMaterial(options: {
  material: MaterialItem;
  writeBack?: boolean;
}): Promise<{ material: MaterialItem; writeBack: boolean }> {
  return workflowRequest<{ material: MaterialItem; writeBack: boolean }>(
    "/api/feishu/materials/save",
    {
      method: "POST",
      body: JSON.stringify({ material: options.material, writeBack: options.writeBack ?? true }),
    },
    "素材保存失败"
  );
}

export async function saveTopic(options: {
  topic: ContentCard;
  writeBack?: boolean;
}): Promise<{ topic: ContentCard; writeBack: boolean }> {
  return workflowRequest<{ topic: ContentCard; writeBack: boolean }>(
    "/api/feishu/topics/save",
    {
      method: "POST",
      body: JSON.stringify({ topic: options.topic, writeBack: options.writeBack ?? true }),
    },
    "选题保存失败"
  );
}

export async function generateContentCards(options?: {
  count?: number;
  status?: string;
  writeBack?: boolean;
  materials?: MaterialItem[];
  glossary?: GlossaryItem[];
}): Promise<ContentCardsResult> {
  return workflowRequest<ContentCardsResult>(
    "/api/feishu/content-cards",
    {
      method: "POST",
      body: JSON.stringify({
        count: options?.count ?? 3,
        status: options?.status ?? MATERIAL_STATUS.pending,
        writeBack: options?.writeBack ?? true,
        materials: options?.materials,
        glossary: options?.glossary,
      }),
    },
    "内容卡片生成失败"
  );
}

export async function generateDrafts(options?: {
  count?: number;
  status?: string;
  writeBack?: boolean;
  cards?: ContentCard[];
}): Promise<DraftsResult> {
  return workflowRequest<DraftsResult>(
    "/api/feishu/drafts",
    {
      method: "POST",
      body: JSON.stringify({
        count: options?.count ?? 1,
        status: options?.status ?? TOPIC_STATUS.pending,
        writeBack: options?.writeBack ?? true,
        cards: options?.cards,
      }),
    },
    "笔记草稿生成失败"
  );
}

export async function saveDraft(options: {
  draft: DraftNote;
  writeBack?: boolean;
}): Promise<SaveDraftResult> {
  return workflowRequest<SaveDraftResult>(
    "/api/feishu/drafts/save",
    {
      method: "POST",
      body: JSON.stringify({
        draft: options.draft,
        writeBack: options.writeBack ?? true,
      }),
    },
    "草稿保存失败"
  );
}

export async function publishDraft(options: {
  draft: DraftNote;
  writeBack?: boolean;
}): Promise<PublishDraftResult> {
  return workflowRequest<PublishDraftResult>(
    "/api/feishu/drafts/publish",
    {
      method: "POST",
      body: JSON.stringify({
        draft: options.draft,
        writeBack: options.writeBack ?? true,
      }),
    },
    "草稿发布失败"
  );
}

export async function generateCover(options: {
  input?: CoverInput;
  sourceType?: "topic" | "draft";
  recordId?: string;
  writeBack?: boolean;
  renderImage?: boolean;
}): Promise<CoverResult> {
  return workflowRequest<CoverResult>(
    "/api/feishu/covers",
    {
      method: "POST",
      body: JSON.stringify({
        input: options.input,
        sourceType: options.sourceType,
        recordId: options.recordId,
        writeBack: options.writeBack ?? true,
        renderImage: options.renderImage ?? false,
      }),
    },
    "封面方案生成失败"
  );
}

export async function generateImageAsset(options: {
  kind?: ImageAssetKind;
  input: ImageWorkflowSourceInput;
  templateType?: ContentImageTemplateType;
}): Promise<ImageAssetResult> {
  return workflowRequest<ImageAssetResult>(
    "/api/feishu/images",
    {
      method: "POST",
      body: JSON.stringify({
        kind: options.kind ?? "content",
        input: options.input,
        templateType: options.templateType,
      }),
    },
    "内容配图生成失败"
  );
}

export async function generateReview(options?: {
  writeBack?: boolean;
  metrics?: ReviewMetric[];
}): Promise<ReviewGenerationResult> {
  return workflowRequest<ReviewGenerationResult>(
    "/api/feishu/review",
    {
      method: "POST",
      body: JSON.stringify({
        writeBack: options?.writeBack ?? true,
        metrics: options?.metrics,
      }),
    },
    "数据复盘生成失败"
  );
}

export async function scanLocalDocs(options?: {
  sourceDir?: string;
  categories?: LocalDocCategory[];
}): Promise<LocalDocsScanResult> {
  return workflowRequest<LocalDocsScanResult>(
    "/api/local-docs/scan",
    {
      method: "POST",
      body: JSON.stringify({
        sourceDir: options?.sourceDir,
        categories: options?.categories,
      }),
    },
    "本地文档扫描失败"
  );
}

export async function syncLocalDocs(options?: {
  sourceDir?: string;
  categories?: LocalDocCategory[];
  writeBack?: boolean;
}): Promise<LocalDocsSyncResult> {
  return workflowRequest<LocalDocsSyncResult>(
    "/api/local-docs/sync",
    {
      method: "POST",
      body: JSON.stringify({
        sourceDir: options?.sourceDir,
        categories: options?.categories,
        writeBack: options?.writeBack ?? true,
      }),
    },
    "本地文档写入飞书失败"
  );
}

export interface TopicPoolImportResult {
  topics: ContentCard[];
  sections: string[];
  writeBack: boolean;
  imported: ContentCard[];
  skipped: number;
}

export async function importTopicPool(options?: {
  sourceDir?: string;
  writeBack?: boolean;
}): Promise<TopicPoolImportResult> {
  return workflowRequest<TopicPoolImportResult>(
    "/api/feishu/topics/import",
    {
      method: "POST",
      body: JSON.stringify({
        sourceDir: options?.sourceDir,
        writeBack: options?.writeBack ?? true,
      }),
    },
    "选题池导入失败"
  );
}

export interface ClueIntakeResult {
  candidates: ExtractedClue[];
  /** 来源标签（GitHub / X / 网页），建素材时回填到素材 sourceType */
  sourceType: string;
  usedFallback: boolean;
  provider: string;
}

/** 线索采集：粘贴链接（X/GitHub/网页，服务端联网抓取）或原文 → 提炼成素材候选 */
export async function extractClues(options: { url?: string; rawText?: string }): Promise<ClueIntakeResult> {
  return workflowRequest<ClueIntakeResult>(
    "/api/feishu/clues",
    { method: "POST", body: JSON.stringify(options) },
    "线索提炼失败"
  );
}
