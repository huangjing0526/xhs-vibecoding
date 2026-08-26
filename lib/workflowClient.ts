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
import type {
  CliProviderStatus,
  ImageGenerationResult,
  LibraryAssetEntry,
  LibraryKind,
  ModelAssetEntry,
  WorkEntry,
} from "@/lib/imageFactory";
import type { LocalDocCategory, LocalDocFileSummary } from "@/lib/localDocs";
import type { ExtractedClue } from "@/lib/clueIntake";
import type { VideoExtractResult } from "@/lib/videoExtract";
import type {
  BenchmarkRhythm,
  BenchmarkSkeleton,
  CastRef,
  CastSlot,
  ScriptDraft,
  ShotGenerationResult,
  Storyboard,
  TopicInput,
  VideoGenProviderId,
  VideoGenProviderStatus,
  VideoProject,
} from "@/lib/videoFactory";
import type { InlineRewriteAction } from "@/lib/inlineRewrite";

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

/** 用户主动取消（AbortController）不是错误，调用方据此静默收尾而非弹报错。 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
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
  signal?: AbortSignal;
}): Promise<ContentCardsResult> {
  return workflowRequest<ContentCardsResult>(
    "/api/feishu/content-cards",
    {
      method: "POST",
      signal: options?.signal,
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
  signal?: AbortSignal;
}): Promise<DraftsResult> {
  return workflowRequest<DraftsResult>(
    "/api/feishu/drafts",
    {
      method: "POST",
      signal: options?.signal,
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
  signal?: AbortSignal;
}): Promise<CoverResult> {
  return workflowRequest<CoverResult>(
    "/api/feishu/covers",
    {
      method: "POST",
      signal: options.signal,
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
  signal?: AbortSignal;
}): Promise<ImageAssetResult> {
  return workflowRequest<ImageAssetResult>(
    "/api/feishu/images",
    {
      method: "POST",
      signal: options.signal,
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
  signal?: AbortSignal;
}): Promise<ReviewGenerationResult> {
  return workflowRequest<ReviewGenerationResult>(
    "/api/feishu/review",
    {
      method: "POST",
      signal: options?.signal,
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

/** 弹 macOS 原生「选择文件夹」对话框，返回真实绝对路径（取消时 path 为 null）。 */
export async function pickDirectory(defaultPath?: string): Promise<{ path: string | null }> {
  return workflowRequest<{ path: string | null }>(
    "/api/system/pick-directory",
    { method: "POST", body: JSON.stringify({ defaultPath }) },
    "打开目录选择器失败"
  );
}

/** 视频拆片：粘抖音/小红书链接或分享口令 → 本地服务抓无水印视频 + 口播脚本 → AI 拆脚本结构 */
export async function extractVideo(input: string): Promise<VideoExtractResult> {
  return workflowRequest<VideoExtractResult>(
    "/api/video/extract",
    { method: "POST", body: JSON.stringify({ input }) },
    "视频拆片失败"
  );
}

export interface InlineRewriteClientResult {
  text: string;
  usedFallback: boolean;
  provider: string;
}

/** 编辑器里选中一段文字后的内联改写。 */
export async function rewriteInline(options: {
  selection: string;
  action: InlineRewriteAction;
  instruction?: string;
  noteTitle?: string;
  painPoint?: string;
  bloggerId?: string;
  signal?: AbortSignal;
}): Promise<InlineRewriteClientResult> {
  return workflowRequest<InlineRewriteClientResult>(
    "/api/rewrite/inline",
    {
      method: "POST",
      signal: options.signal,
      body: JSON.stringify({
        selection: options.selection,
        action: options.action,
        instruction: options.instruction,
        noteTitle: options.noteTitle,
        painPoint: options.painPoint,
        bloggerId: options.bloggerId,
      }),
    },
    "内联改写失败"
  );
}

/** AI 图片工厂：探测本机已登录的生图 CLI。 */
export async function getImageProviders(): Promise<{ providers: CliProviderStatus[] }> {
  const response = await fetch("/api/image-factory/providers", { cache: "no-store" });
  return parseApiResponse<{ providers: CliProviderStatus[] }>(response, "CLI 状态检查失败");
}

/** AI 图片工厂：把生成好的产物复制到用户指定的输出目录。 */
export async function saveGeneratedImage(payload: {
  sourcePath: string;
  targetDir: string;
  fileName: string;
}): Promise<{ savedPath: string }> {
  const response = await fetch("/api/image-factory/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseApiResponse<{ savedPath: string }>(response, "保存目标图失败");
}

/**
 * AI 图片工厂：生成一张目标图。
 * 走 multipart 上传参考图，因此不能用 workflowRequest（它固定 JSON 头）。
 */
export async function generateImage(
  formData: FormData,
  signal?: AbortSignal
): Promise<ImageGenerationResult> {
  const response = await fetch("/api/image-factory/generate", { method: "POST", body: formData, signal });
  return parseApiResponse<ImageGenerationResult>(response, "目标图生成失败");
}

/** 作品：本机跑出来的全部产出，按时间倒序。 */
export async function listWorks(): Promise<{ works: WorkEntry[] }> {
  const response = await fetch("/api/image-factory/works", { cache: "no-store" });
  return parseApiResponse<{ works: WorkEntry[] }>(response, "作品读取失败");
}

/** 作品：把一件产出连同它的产物目录一起删掉。 */
export async function deleteWork(jobId: string, dir: string): Promise<void> {
  const query = new URLSearchParams({ job: jobId, dir });
  const response = await fetch(`/api/image-factory/works?${query.toString()}`, { method: "DELETE" });
  await parseApiResponse(response, "作品删除失败");
}

/** 模特库：读出本机已存的全部模特资产。 */
export async function listModelAssets(): Promise<{ models: ModelAssetEntry[] }> {
  const response = await fetch("/api/image-factory/models", { cache: "no-store" });
  return parseApiResponse<{ models: ModelAssetEntry[] }>(response, "模特库读取失败");
}

/** 素材库：把本机产物存进模特库 / 产品库 / 场景库，三库同一条链路。 */
export async function saveLibraryAssets(
  kind: LibraryKind,
  items: Array<{ sourcePath: string; name: string; sourceLabel: string; traits?: string }>
): Promise<LibraryAssetEntry[]> {
  const data = await workflowRequest<Record<string, LibraryAssetEntry[]>>(
    `/api/image-factory/${kind}`,
    { method: "POST", body: JSON.stringify({ items }) },
    kind === "models" ? "存入模特库失败" : "存入产品库失败"
  );
  return data[kind] || [];
}

/** 模特库：移除一条模特资产，图片一并删掉。 */
export async function deleteModelAsset(modelId: string): Promise<{ id: string }> {
  return workflowRequest<{ id: string }>(
    `/api/image-factory/models?id=${encodeURIComponent(modelId)}`,
    { method: "DELETE" },
    "移除模特失败"
  );
}

/** 视频工厂：拿对标结构骨架 + 自己的选题，写一版新脚本。 */
export async function rewriteVideoScript(options: {
  skeleton: BenchmarkSkeleton | null;
  topic: TopicInput;
  targetDurationSec: number;
  signal?: AbortSignal;
}): Promise<{ script: ScriptDraft; usedFallback: boolean; provider: string }> {
  return workflowRequest(
    "/api/video-factory/script",
    {
      method: "POST",
      signal: options.signal,
      body: JSON.stringify({
        skeleton: options.skeleton,
        topic: options.topic,
        targetDurationSec: options.targetDurationSec,
      }),
    },
    "脚本改写失败"
  );
}

/** 视频工厂：把脚本拆成镜头表，每镜带首帧提示词与运动提示词。 */
export async function analyzeStoryboard(options: {
  script: ScriptDraft;
  visualStyle?: string;
  rhythm?: BenchmarkRhythm | null;
  /** 项目选定的出片引擎，决定每镜能切成几秒 */
  genProvider?: VideoGenProviderId;
  signal?: AbortSignal;
}): Promise<{ storyboard: Storyboard; usedFallback: boolean; provider: string }> {
  return workflowRequest(
    "/api/video-factory/storyboard",
    {
      method: "POST",
      signal: options.signal,
      body: JSON.stringify({
        script: options.script,
        visualStyle: options.visualStyle,
        rhythm: options.rhythm,
        genProvider: options.genProvider,
      }),
    },
    "分镜拆解失败"
  );
}

/** 视频工厂：拆一条对标视频的真实切镜节奏，返回镜头表与关键帧。 */
export async function detectBenchmarkRhythm(formData: FormData): Promise<{ rhythm: BenchmarkRhythm }> {
  const response = await fetch("/api/video-factory/benchmark", { method: "POST", body: formData });
  return parseApiResponse<{ rhythm: BenchmarkRhythm }>(response, "节奏拆解失败");
}

/** 视频工厂：拆过的节奏模板，可跨项目复用。 */
export async function listBenchmarkRhythms(): Promise<{ rhythms: BenchmarkRhythm[] }> {
  const response = await fetch("/api/video-factory/benchmark", { cache: "no-store" });
  return parseApiResponse<{ rhythms: BenchmarkRhythm[] }>(response, "节奏模板读取失败");
}

/** 可复用参考素材库（模特 / 产品 / 场景）：三种库同一套接口，只差路径。 */
export async function listLibraryAssets(kind: LibraryKind): Promise<LibraryAssetEntry[]> {
  const response = await fetch(`/api/image-factory/${kind}`, { cache: "no-store" });
  const data = await parseApiResponse<Record<string, LibraryAssetEntry[]>>(response, "素材库读取失败");
  return data[kind] || [];
}

/**
 * 素材库：把手上已有的图直接传进库。
 * 自己拍的场景和商品实拍从没跑过生成，没有产物路径，只留「按路径入库」那条路它们永远进不来。
 * 走 multipart，因此不能用 workflowRequest（它固定 JSON 头）。
 */
export async function uploadLibraryAssets(kind: LibraryKind, formData: FormData): Promise<LibraryAssetEntry[]> {
  const response = await fetch(`/api/image-factory/${kind}`, { method: "POST", body: formData });
  const data = await parseApiResponse<Record<string, LibraryAssetEntry[]>>(response, "上传入库失败");
  return data[kind] || [];
}

/** 素材库：移除一条，图片一并删掉。 */
export async function deleteLibraryAsset(kind: LibraryKind, assetId: string): Promise<{ id: string }> {
  return workflowRequest<{ id: string }>(
    `/api/image-factory/${kind}?id=${encodeURIComponent(assetId)}`,
    { method: "DELETE" },
    "移除素材失败"
  );
}

/**
 * 视频工厂：给项目绑定角色 / 产品参考图。
 * 走 multipart 以支持现场上传，因此不能用 workflowRequest（它固定 JSON 头）。
 */
export async function bindProjectCast(formData: FormData): Promise<{ slot: CastSlot; cast: CastRef }> {
  const response = await fetch("/api/video-factory/cast", { method: "POST", body: formData });
  return parseApiResponse<{ slot: CastSlot; cast: CastRef }>(response, "绑定参考图失败");
}

/** 视频工厂：解绑某个槽位。 */
export async function clearProjectCast(projectId: string, slot: CastSlot): Promise<{ slot: CastSlot }> {
  return workflowRequest<{ slot: CastSlot }>(
    `/api/video-factory/cast?projectId=${encodeURIComponent(projectId)}&slot=${slot}`,
    { method: "DELETE" },
    "取消绑定失败"
  );
}

/** 视频工厂：按分镜提示词生成一镜的首帧图，自动带上绑定的角色与产品。 */
export async function generateShotFrame(
  formData: FormData,
  signal?: AbortSignal,
): Promise<{ projectId: string; shotOrder: number; framePath: string }> {
  const response = await fetch("/api/video-factory/frame", { method: "POST", body: formData, signal });
  return parseApiResponse(response, "首帧生成失败");
}

/** 视频工厂：让模型看关键帧，判断这条对标能不能用 AI 复刻。 */
export async function screenReplicability(
  rhythmId: string,
): Promise<{ rhythm: BenchmarkRhythm; usedFallback: boolean; provider: string }> {
  return workflowRequest(
    "/api/video-factory/benchmark/screen",
    { method: "POST", body: JSON.stringify({ id: rhythmId }) },
    "可复刻性筛查失败"
  );
}

/** 视频工厂：删一份节奏模板，源视频与关键帧一起删。 */
export async function deleteBenchmarkRhythm(rhythmId: string): Promise<{ id: string }> {
  return workflowRequest<{ id: string }>(
    `/api/video-factory/benchmark?id=${encodeURIComponent(rhythmId)}`,
    { method: "DELETE" },
    "节奏模板删除失败"
  );
}

/** 视频工厂：探测图生视频引擎的可用状态。 */
export async function getVideoGenProviders(): Promise<{ providers: VideoGenProviderStatus[] }> {
  const response = await fetch("/api/video-factory/providers", { cache: "no-store" });
  return parseApiResponse<{ providers: VideoGenProviderStatus[] }>(response, "生成引擎状态检查失败");
}

/**
 * 视频工厂：生成一镜。
 * 走 multipart 上传首帧图，因此不能用 workflowRequest（它固定 JSON 头）。
 */
export async function generateShotClip(
  formData: FormData,
  signal?: AbortSignal
): Promise<ShotGenerationResult> {
  const response = await fetch("/api/video-factory/generate", { method: "POST", body: formData, signal });
  return parseApiResponse<ShotGenerationResult>(response, "图生视频失败");
}

/** 视频工厂：把在即梦/可灵手动生成好的 mp4 挂到某一镜上。 */
export async function attachShotClip(formData: FormData): Promise<ShotGenerationResult> {
  const response = await fetch("/api/video-factory/clip", { method: "POST", body: formData });
  return parseApiResponse<ShotGenerationResult>(response, "成片上传失败");
}

/** 视频工厂：图片工厂里可以拿来当首帧的图。 */
export async function listFrameCandidates(): Promise<{
  frames: Array<{ path: string; label: string; createdAt: string }>;
}> {
  const response = await fetch("/api/video-factory/frames", { cache: "no-store" });
  return parseApiResponse(response, "首帧图列表读取失败");
}

/** 视频工厂：项目列表，最近改的在前。 */
export async function listVideoProjects(): Promise<{ projects: VideoProject[] }> {
  const response = await fetch("/api/video-factory/project", { cache: "no-store" });
  return parseApiResponse<{ projects: VideoProject[] }>(response, "项目列表读取失败");
}

/** 视频工厂：整份覆盖保存，每步结束存一次。 */
export async function saveVideoProject(
  project: Partial<VideoProject>,
  /** clips 归服务端所有，存盘不会收前端那份；重拆分镜要清空得显式说一声。 */
  options?: { resetClips?: boolean },
): Promise<{ project: VideoProject }> {
  return workflowRequest<{ project: VideoProject }>(
    "/api/video-factory/project",
    { method: "POST", body: JSON.stringify({ project, resetClips: options?.resetClips }) },
    "项目保存失败"
  );
}

/** 视频工厂：删项目，产物一起删。 */
export async function deleteVideoProject(projectId: string): Promise<{ id: string }> {
  return workflowRequest<{ id: string }>(
    `/api/video-factory/project?id=${encodeURIComponent(projectId)}`,
    { method: "DELETE" },
    "项目删除失败"
  );
}

export interface IntentClientResult {
  area: string;
  reason: string;
  /** 复述出来的「要做什么」，由调用方带进目标工具。 */
  brief: string;
  /** 原话里的链接，没有就是空串。 */
  url: string;
  usedFallback: boolean;
  provider: string;
}

/** 首页输入框：把一句自然语言判成「去哪个区」。 */
export async function routeIntent(text: string, signal?: AbortSignal): Promise<IntentClientResult> {
  return workflowRequest<IntentClientResult>(
    "/api/intent",
    { method: "POST", signal, body: JSON.stringify({ text }) },
    "没看懂这句话要做什么"
  );
}
