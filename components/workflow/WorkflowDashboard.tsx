"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, Download, FileText, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import Button from "@/components/ui/Button";
import CollapsiblePanel from "@/components/ui/CollapsiblePanel";
import EmptyState from "@/components/ui/EmptyState";
import PipelineRail, { type PipelineStep } from "@/components/ui/PipelineRail";
import CommandPalette, { type Command } from "@/components/ui/CommandPalette";
import NavIcon from "@/components/workflow/NavIcon";
import { useAbortableTasks } from "@/components/workflow/useAbortableTasks";
import CoverStudio, { type ImageMode } from "@/components/workflow/CoverStudio";
import TopicPoolImportPanel from "@/components/workflow/TopicPoolImportPanel";
import ClueIntakePanel from "@/components/workflow/ClueIntakePanel";
import LocalDocsSyncPanel from "@/components/workflow/LocalDocsSyncPanel";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import ReviewDashboard from "@/components/workflow/ReviewDashboard";
import WorkflowOnboarding from "@/components/workflow/WorkflowOnboarding";
import BloggerResearch from "@/components/workflow/BloggerResearch";
import VideoExtractPanel from "@/components/workflow/VideoExtractPanel";
import RewriteStudio from "@/components/workflow/RewriteStudio";
import VideoStudio from "@/components/workflow/VideoStudio";
import WorkbenchShell from "@/components/workflow/WorkbenchShell";
import AssetLibrary from "@/components/workflow/AssetLibrary";
import CanvasPage from "@/components/workflow/CanvasPage";
import WorksLibrary from "@/components/workflow/WorksLibrary";
import { TemplateGallery, ToolsGallery } from "@/components/workflow/GalleryPage";
import HomeHub from "@/components/home/HomeHub";
import { AREAS, COMMAND_AREAS, PLAIN_AREAS, type AreaId } from "@/lib/capabilities";
import { pushRecent, readRecent, type RecentEntry } from "@/lib/recentUsed";
import { ROUTABLE_AREAS, routeByKeyword } from "@/lib/intentRouting";
import PageHeader from "@/components/workflow/PageHeader";
import ProjectList, { getNoteStatus, type ProjectLane } from "@/components/workflow/ProjectList";
import NoteEditor from "@/components/workflow/NoteEditor";
import NoteInspector from "@/components/workflow/NoteInspector";
import QualityGate from "@/components/workflow/QualityGate";
import WatermarkStudio from "@/components/workflow/WatermarkStudio";
import ImageFactory from "@/components/workflow/ImageFactory";
import {
  getUsableDrafts,
  getUsableTopics,
  isSameDraft,
  isSameTopic,
  mergeByKey,
} from "@/lib/snapshotMerge";
import { runQualityCheck } from "@/lib/qualityCheck";
import ManualEntryForm, { type ManualField } from "@/components/workflow/ManualEntryForm";
import {
  applyMaterialEdit,
  applyTopicEdit,
  createManualMaterial,
  createManualTopic,
  type ManualMaterialInput,
  type ManualTopicInput,
} from "@/lib/manualEntry";
import type { ExtractedClue } from "@/lib/clueIntake";
import type { InlineRewriteAction } from "@/lib/inlineRewrite";
import {
  DEMO_BLOGGER_PROFILES,
  getDistillationForBlogger,
  type BloggerDistillation,
} from "@/lib/bloggerWorkflow";
import { DEFAULT_COVER_CONFIG, downloadCover, type CoverConfig } from "@/lib/cover";
import type { CoverPlan } from "@/lib/coverWorkflow";
import {
  contentCardToImageSourceInput,
  downloadImageAsset,
  draftToImageSourceInput,
  type ContentImagePlan,
  type ContentImageTemplateType,
} from "@/lib/imageWorkflow";
import { createMarkdownDemoSnapshot, DEMO_SELECTED_MATERIAL_IDS, DEMO_SNAPSHOT } from "@/lib/demoWorkflow";
import {
  filterMetricsByDraftStatus,
  isPublishedDraft,
  type ContentCard,
  type DraftNote,
  type MaterialItem,
  type ReviewResult,
  MATERIAL_STATUS,
  TOPIC_STATUS,
} from "@/lib/xhsWorkflow";
import {
  generateContentCards,
  generateCover,
  generateDrafts,
  generateImageAsset,
  generateReview,
  getWorkflowBootstrap,
  deleteRecord,
  isAbortError,
  listVideoProjects,
  publishDraft,
  saveDraft,
  saveMaterial,
  rewriteInline,
  saveTopic,
  syncWorkflowData,
  routeIntent,
  type DeletableKind,
  type WorkflowBootstrapResult,
  type WorkflowMode,
  type WorkflowSnapshot,
} from "@/lib/workflowClient";
import type { VideoPlan } from "@/lib/videoWorkflow";
import { describeProjectProgress, type BenchmarkRhythm, type BenchmarkSkeleton, type VideoProject } from "@/lib/videoFactory";
import { templateTarget, type TemplateCard } from "@/lib/templates";
import VideoFactory from "./VideoFactory";
import SourceWorkspace from "./SourceWorkspace";
import type { Notice } from "./types";

// 对标博主道库选项：源自模块常量，全程不变，提到组件外避免每次渲染重建
const DAOKU_OPTIONS = DEMO_BLOGGER_PROFILES.map((profile) => ({ bloggerId: profile.id, name: profile.name }));

/**
 * 图片工厂默认就是 AI 生图：产出类型在 ImageFactory 内部排成一排 tab，一眼看完能做哪些图。
 * 叠字排版是 AI 底图之后的下一环——中文标题交给 AI 画必糊，所以底图与文字层分开，
 * 从底图点「拿去叠标题」才切到这里。
 */
const TEXT_LAYER_TABS: Array<{ value: ImageMode; label: string; subtitle: string }> = [
  { value: "cover", label: "封面叠字", subtitle: "把 AI 底图配上标题排版，文字层本地渲染，字不会糊。" },
  { value: "content", label: "配图叠字", subtitle: "把正文配图配上文字排版。" },
];
const TEXT_LAYER_OPTIONS = TEXT_LAYER_TABS.map(({ value, label }) => ({ value, label }));
const AI_IMAGE_SUBTITLE = "上传素材、选产出类型与生成模型，用本机订阅 CLI 一次生成多张目标图。";

/**
 * 从首页那句话带过来的要求。
 * 目标工具只吃得下其中一部分（拆片只要链接、生图只要一句要求），剩下的原话留在页顶，
 * 让人照着填——比丢掉它、或硬塞进不匹配的字段都诚实。
 */
function HandoffBanner({
  brief,
  reason,
  onDismiss,
}: {
  brief: string;
  reason: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-brand-200 bg-brand-50 px-3.5 py-2.5">
      <Sparkles size={14} className="mt-0.5 shrink-0 text-brand-500" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs font-semibold leading-5 text-ink">
        本次要求：{brief}
        {reason && <span className="ml-1.5 font-medium text-muted">（{reason}）</span>}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-lg p-1 text-faint transition-colors hover:text-ink"
        aria-label="关掉这条要求"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// 单页工具区统一的滚动容器：软色画布 + 居中定宽，让区内的白卡浮起来
function ToolScroll({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-auto bg-soft">
      <div className="mx-auto max-w-5xl p-5 md:p-7">{children}</div>
    </div>
  );
}

// 工具页的「当前项目」上下文条：工具页脱离了三栏，用它提示正在处理哪一个
function NoteContextBar({ note, onGoProjects }: { note: ContentCard | null; onGoProjects: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-xs shadow-card">
      <span className="shrink-0 font-bold text-faint">当前项目</span>
      <span className="truncate font-bold text-ink">
        {note ? note.titleCandidates[0] || note.coreViewpoint : "未选择"}
      </span>
      <button
        type="button"
        onClick={onGoProjects}
        className="ml-auto shrink-0 rounded-lg px-1.5 font-bold text-brand-500 transition-colors hover:text-brand-600"
      >
        切换
      </button>
    </div>
  );
}

// 工具页没选中项目时的空态：把用户引回项目页选一个
function EmptyNote({ hint, onGoProjects }: { hint: string; onGoProjects: () => void }) {
  return (
    <EmptyState
      icon={<FileText size={22} />}
      title={hint}
      action={
        <Button variant="primary" onClick={onGoProjects}>
          去项目页选一个
        </Button>
      }
    />
  );
}

// 单笔记工具页统一骨架：滚动容器 + 页头（标题/副标题取自 AREAS）+ 可选「当前笔记」条 + 缺笔记空态。
// 封面/视频/改写/质检共用它，只各自传入自己的工具组件与就绪条件。
function ToolPage({
  area,
  note,
  subtitle,
  ready = true,
  emptyHint,
  onGoProjects,
  children,
}: {
  area: AreaId;
  /** 传入则显示「当前笔记」上下文条；对标拆解这类与具体笔记无关的页不传。 */
  note?: ContentCard | null;
  /** 覆写页头副标题；分段切换的区（图片工厂）按当前段换文案。 */
  subtitle?: string;
  /** false 时显示空态而非 children（缺笔记 / 缺草稿）。 */
  ready?: boolean;
  emptyHint?: string;
  onGoProjects: () => void;
  children: ReactNode;
}) {
  const meta = AREAS[area];
  return (
    <ToolScroll>
      <PageHeader
        title={meta.label}
        subtitle={subtitle || meta.subtitle}
        meta={note !== undefined ? <NoteContextBar note={note} onGoProjects={onGoProjects} /> : undefined}
      />
      {ready ? children : <EmptyNote hint={emptyHint || ""} onGoProjects={onGoProjects} />}
    </ToolScroll>
  );
}

// 手动新增/编辑弹窗的字段定义：新增与编辑共用同一套
const MATERIAL_FIELDS: ManualField[] = [
  { name: "event", label: "核心事件", placeholder: "一句话说清这条素材讲了什么", required: true },
  { name: "method", label: "可复用方法", placeholder: "从中能沉淀出的做法/结论", required: true, multiline: true },
  { name: "sourceType", label: "来源类型", placeholder: "如 开发日报 / 问题记录（可留空）" },
  { name: "pitfall", label: "踩坑/痛点", placeholder: "选填" },
  { name: "relatedTerm", label: "相关术语", placeholder: "选填" },
];
const TOPIC_FIELDS: ManualField[] = [
  { name: "title", label: "标题", placeholder: "这条选题的标题", required: true },
  { name: "coreViewpoint", label: "核心观点", placeholder: "想传达的核心结论", required: true, multiline: true },
  { name: "painPoint", label: "读者痛点", placeholder: "戳中读者的什么痛点", required: true },
  { name: "targetReader", label: "目标读者", placeholder: "选填" },
  { name: "realCase", label: "真实案例", placeholder: "选填" },
  { name: "reusableAsset", label: "可收藏资产", placeholder: "选填" },
];

const EMPTY_SNAPSHOT: WorkflowSnapshot = {
  materials: [],
  glossary: [],
  topics: [],
  drafts: [],
  metrics: [],
};

function topicToCoverInput(topic: ContentCard) {
  return {
    topicId: topic.topicId,
    title: topic.titleCandidates[0],
    coverText: topic.coverText,
    coreViewpoint: topic.coreViewpoint,
    painPoint: topic.painPoint,
    reusableAsset: topic.reusableAsset,
    column: topic.column,
  };
}

/**
 * 与 lib/coverWorkflow.ts 的同名函数**映射不同**：这里把 imageSuggestions 塞进 reusableAsset，
 * 那边放进 imageSuggestions。而 pickStyle 读的正是 reusableAsset，两者会选出不同的封面风格
 * （coverWorkflow 的 isImageSuggestion 防御就是为这个映射准备的）。合并前先确认要哪种行为。
 */
function draftToCoverInput(draft: DraftNote) {
  return {
    noteId: draft.noteId,
    topicId: draft.topicId,
    title: draft.title,
    coverText: draft.coverText,
    reusableAsset: draft.imageSuggestions,
    column: "草稿",
  };
}

function applyCoverMetadata<T extends ContentCard | DraftNote>(item: T, plan: CoverPlan, config: CoverConfig): T {
  return {
    ...item,
    coverTitle: plan.title,
    coverSubtitle: plan.subtitle,
    coverStyle: plan.style,
    coverPrimaryColor: plan.backgroundColor,
    coverConfigJson: JSON.stringify(config, null, 2),
    coverStatus: "已生成",
  };
}

export default function WorkflowDashboard() {
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>(EMPTY_SNAPSHOT);
  const [selectedTopic, setSelectedTopic] = useState<ContentCard | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<DraftNote | null>(null);
  const [coverConfig, setCoverConfig] = useState<CoverConfig>({ ...DEFAULT_COVER_CONFIG });
  const [coverPlan, setCoverPlan] = useState<CoverPlan | null>(null);
  /** 叠字排版区里的两种叠法。AI 生图是另一个区，不再挤进这个状态。 */
  const [imageTab, setImageTab] = useState<ImageMode>("cover");

  // 别处的「去做封面」入口：进叠字排版并落在封面那一段
  const openCover = useCallback(() => {
    setImageTab("cover");
    setArea("textLayer");
  }, []);
  const [contentImageTemplate, setContentImageTemplate] = useState<ContentImageTemplateType>("flowchart");
  const [contentImagePlan, setContentImagePlan] = useState<ContentImagePlan | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  // 当前工作区，默认落地首页；可选值见 lib/capabilities 的 AreaId
  const [area, setArea] = useState<AreaId>("home");
  // 从模板目录带进图片工厂的模板，工厂接住后立刻清空——否则来回切区会重复选回去
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  // 同上，走视频那条线。带整条节奏而不是 id：目录手上本来就有，传 id 会让工厂再查一次库，
  // 那次查询扑空时这个 id 会一直挂着，等下一次进视频工厂再触发，把人正做着的项目冲掉。
  const [pendingRhythm, setPendingRhythm] = useState<BenchmarkRhythm | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [isRoutingIntent, setIsRoutingIntent] = useState(false);
  // 首页那句话的三份去处：横幅给人看，另外两个是目标工具真正吃得下的起手参数。
  // 各自独立而不是塞一个对象，是因为消费者不同、清空时机也不同（谁接住谁清）。
  const [handoff, setHandoff] = useState<{ area: AreaId; brief: string; reason: string } | null>(null);
  const [pendingExtractUrl, setPendingExtractUrl] = useState<string | null>(null);
  const [pendingImageBrief, setPendingImageBrief] = useState<string | null>(null);
  const [pendingVideoTopic, setPendingVideoTopic] = useState<string | null>(null);
  const [bloggerDistillation, setBloggerDistillation] = useState<BloggerDistillation | null>(null);
  // 拆片页送往视频工厂的结构骨架，视频工厂接住后立刻清空——否则来回切区会重复灌一次
  const [videoSkeleton, setVideoSkeleton] = useState<BenchmarkSkeleton | null>(null);
  // 项目页并排列出的视频项目；挂载时拉一次给 ⌘K，每次进项目页再刷新
  const [videoProjects, setVideoProjects] = useState<VideoProject[]>([]);
  // 项目页/⌘K 点开的视频项目（整条对象，工厂不用再拉列表按 id 找），工厂接住后清空
  const [pendingVideoProject, setPendingVideoProject] = useState<VideoProject | null>(null);
  // 全局「创建 → 视频项目」的一次性信号
  const [pendingFreshVideo, setPendingFreshVideo] = useState(false);
  // 项目页当前看哪条 lane。放这层是因为它是页面级事实：从视频 lane 进工厂再回来，还该停在视频 lane
  const [projectLane, setProjectLane] = useState<ProjectLane>("post");
  // 每条选题各自绑定的对标博主道库：topicId -> bloggerId（""=不绑定）
  const [topicDaokuMap, setTopicDaokuMap] = useState<Record<string, string>>({});
  const [videoPlan, setVideoPlan] = useState<VideoPlan | null>(null);
  const [videoRendered, setVideoRendered] = useState(false);
  const setNotice = useCallback((notice: Notice) => {
    // 带 action 的提示渲染成 toast 上的一个按钮，给「生成完了去哪看」这类承接用
    const options = notice.action ? { action: { label: notice.action.label, onClick: notice.action.run } } : undefined;
    if (notice.type === "success") {
      toast.success(notice.message, options);
    } else if (notice.type === "error") {
      toast.error(notice.message, options);
    } else {
      toast.info(notice.message, options);
    }
  }, []);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPublishingDraft, setIsPublishingDraft] = useState(false);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [isGeneratingContentImage, setIsGeneratingContentImage] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isRewritingInline, setIsRewritingInline] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // AI 生成都可中途取消，key 与下面各 handler 一一对应
  const tasks = useAbortableTasks();
  const [coverDataUrl, setCoverDataUrl] = useState("");
  const [contentImageDataUrl, setContentImageDataUrl] = useState("");
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  // 编辑弹窗：素材 / 选题
  const [editingMaterial, setEditingMaterial] = useState<MaterialItem | null>(null);
  const [editingTopic, setEditingTopic] = useState<ContentCard | null>(null);
  // 新增弹窗：素材（素材库工具条）/ 选题（新建项目）
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [addingTopic, setAddingTopic] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("demo");
  const [bootstrapConfig, setBootstrapConfig] = useState<WorkflowBootstrapResult["config"] | null>(null);
  // 录入与提炼：三种导入源用 tab 切换（线索采集 / 选题池 / 本地文档）
  const [intakeTab, setIntakeTab] = useState<"clue" | "pool" | "docs">("clue");
  const hasPendingMaterials = snapshot.materials.some((item) => item.status === MATERIAL_STATUS.pending);
  const isFeishuReady = workflowMode === "connected" && Boolean(bootstrapConfig?.feishuReady);
  const localDocsSourceDir = bootstrapConfig?.localDocsSourceDir || "";
  const topicPoolDir = bootstrapConfig?.topicPoolDir || "";
  const usableTopics = useMemo(() => getUsableTopics(snapshot.topics), [snapshot.topics]);
  const usableDrafts = useMemo(() => getUsableDrafts(snapshot.drafts), [snapshot.drafts]);
  const publishedMetrics = useMemo(
    () => filterMetricsByDraftStatus(snapshot.metrics, usableDrafts),
    [snapshot.metrics, usableDrafts]
  );
  const selectedMaterials = useMemo(
    () => snapshot.materials.filter((item) => selectedMaterialIds.includes(item.recordId)),
    [selectedMaterialIds, snapshot.materials]
  );
  // 发布前质检：纯规则、实时随草稿/选题/封面变化（阶段 A，不写回飞书）
  const qualityResult = useMemo(
    () => runQualityCheck({ draft: selectedDraft, topic: selectedTopic, coverReady: Boolean(coverDataUrl) }),
    [selectedDraft, selectedTopic, coverDataUrl]
  );

  const setFriendlyError = useCallback((action: string, error: unknown) => {
    console.error("[WorkflowDashboard] 操作失败", { action, error });
    setNotice({
      type: "error",
      message: error instanceof Error ? error.message : "操作失败，请稍后重试",
    });
  }, [setNotice]);

  const applySnapshot = useCallback((data: WorkflowSnapshot, preferredMaterialIds: string[] = []) => {
    setSnapshot(data);
    setSelectedMaterialIds((current) => {
      const validIds = new Set(data.materials.map((item) => item.recordId));
      const keptIds = current.filter((id) => validIds.has(id));
      if (keptIds.length > 0) return keptIds;
      return preferredMaterialIds.filter((id) => validIds.has(id));
    });
    setSelectedTopic((current) => {
      const topics = getUsableTopics(data.topics);
      if (current) return topics.find((topic) => topic.topicId === current.topicId) || topics[0] || null;
      return topics[0] || null;
    });
    setSelectedDraft((current) => {
      const drafts = getUsableDrafts(data.drafts);
      if (current) return drafts.find((draft) => draft.noteId === current.noteId) || drafts[0] || null;
      return drafts[0] || null;
    });
  }, []);

  const loadFeishuSnapshot = useCallback(async (): Promise<WorkflowSnapshot | null> => {
    setIsSyncing(true);
    try {
      const data = await syncWorkflowData();
      applySnapshot(data);
      setWorkflowMode("connected");
      setNotice({ type: "success", message: "飞书数据已同步" });
      return data;
    } catch (error) {
      setFriendlyError("workflow.sync", error);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [applySnapshot, setFriendlyError, setNotice]);

  const handleUseDemo = useCallback(() => {
    setWorkflowMode("demo");
    applySnapshot(DEMO_SNAPSHOT, DEMO_SELECTED_MATERIAL_IDS);
    setArea("projects");
    setCoverPlan(null);
    setCoverDataUrl("");
    setImageTab("cover");
    setContentImagePlan(null);
    setContentImageDataUrl("");
    setNotice({ type: "success", message: "已进入 Demo 模式，不会写入飞书" });
  }, [applySnapshot, setNotice]);

  const handleLoadMarkdownDemo = useCallback((markdown: string) => {
    const nextSnapshot = createMarkdownDemoSnapshot(markdown);
    setWorkflowMode("demo");
    applySnapshot(nextSnapshot, [nextSnapshot.materials[0]?.recordId || ""]);
    setArea("projects");
    setCoverPlan(null);
    setCoverDataUrl("");
    setImageTab("content");
    setContentImagePlan(null);
    setContentImageDataUrl("");
    setNotice({ type: "success", message: "已从 Markdown 生成 Demo 内容包，可继续生成图片" });
  }, [applySnapshot, setNotice]);

  const loadSnapshot = useCallback(async () => {
    if (workflowMode === "demo") {
      handleUseDemo();
      return;
    }
    await loadFeishuSnapshot();
  }, [handleUseDemo, loadFeishuSnapshot, workflowMode]);

  const handleConnectFeishu = useCallback(async () => {
    if (!bootstrapConfig?.feishuReady) {
      setNotice({
        type: "error",
        message: "飞书配置还不完整，请先补齐应用凭证和 5 张表 ID。",
      });
      return;
    }
    await loadFeishuSnapshot();
  }, [bootstrapConfig?.feishuReady, loadFeishuSnapshot, setNotice]);

  const handleSelectTopic = useCallback((topic: ContentCard) => {
    setSelectedTopic(topic);
    setSelectedDraft(null);
    setContentImagePlan(null);
    setContentImageDataUrl("");
  }, []);

  const handleSelectDraft = useCallback((draft: DraftNote) => {
    setSelectedDraft(draft);
    setContentImagePlan(null);
    setContentImageDataUrl("");
  }, []);

  const handleBindDaoku = useCallback((topicId: string, bloggerId: string) => {
    setTopicDaokuMap((current) => ({ ...current, [topicId]: bloggerId }));
  }, []);

  // 当前选题生效的道库：优先用该选题绑定的，其次退回博主步全局选择
  const getDaokuForTopic = useCallback(
    (topic: ContentCard | null): BloggerDistillation | null => {
      const boundId = topic ? topicDaokuMap[topic.topicId] : undefined;
      if (!boundId) return bloggerDistillation;
      if (bloggerDistillation?.bloggerId === boundId) return bloggerDistillation;
      return getDistillationForBlogger(boundId);
    },
    [bloggerDistillation, topicDaokuMap]
  );

  // 草稿步换选题：切到该选题已有的草稿（没有则置空，由「生成草稿」补）
  const handleToggleMaterial = useCallback((materialId: string) => {
    setSelectedMaterialIds((current) =>
      current.includes(materialId)
        ? current.filter((id) => id !== materialId)
        : [...current, materialId]
    );
  }, []);

  const handleSelectPendingMaterials = useCallback(() => {
    setSelectedMaterialIds(
      snapshot.materials
        .filter((item) => item.status === MATERIAL_STATUS.pending)
        .slice(0, 6)
        .map((item) => item.recordId)
    );
  }, [snapshot.materials]);

  const handleClearSelectedMaterials = useCallback(() => {
    setSelectedMaterialIds([]);
  }, []);

  // 通用删除底座：连飞书时先删飞书记录，失败则中止本地移除并提示。
  const deleteEntityRemote = useCallback(
    async (kind: DeletableKind, recordIds: string[]): Promise<boolean> => {
      if (workflowMode !== "connected") return true;
      const targets = recordIds.filter(Boolean);
      if (targets.length === 0) return true;
      try {
        await Promise.all(targets.map((recordId) => deleteRecord(kind, recordId)));
        return true;
      } catch (error) {
        setFriendlyError(`${kind}.delete`, error);
        return false;
      }
    },
    [setFriendlyError, workflowMode]
  );

  const handleDeleteMaterial = useCallback(async (materialId: string) => {
    const target = snapshot.materials.find((item) => item.recordId === materialId);
    const ok = await deleteEntityRemote("material", target?.recordId ? [target.recordId] : []);
    if (!ok) return;
    setSnapshot((current) => ({
      ...current,
      materials: current.materials.filter((item) => item.recordId !== materialId),
    }));
    setSelectedMaterialIds((current) => current.filter((id) => id !== materialId));
    setNotice({ type: "success", message: workflowMode === "connected" ? "素材已从飞书删除" : "素材已移除" });
  }, [deleteEntityRemote, setNotice, snapshot.materials, workflowMode]);

  const handleBatchDeleteMaterials = useCallback(async (materialIds: string[]) => {
    const idSet = new Set(materialIds);
    const recordIds = snapshot.materials.filter((item) => idSet.has(item.recordId)).map((item) => item.recordId);
    const ok = await deleteEntityRemote("material", recordIds);
    if (!ok) return;
    setSnapshot((current) => ({
      ...current,
      materials: current.materials.filter((item) => !idSet.has(item.recordId)),
    }));
    setSelectedMaterialIds((current) => current.filter((id) => !idSet.has(id)));
    setNotice({ type: "success", message: `已删除 ${materialIds.length} 条素材` });
  }, [deleteEntityRemote, setNotice, snapshot.materials]);

  const handleEditMaterial = useCallback((item: MaterialItem) => setEditingMaterial(item), []);

  const handleSubmitEditMaterial = useCallback(async (input: ManualMaterialInput) => {
    if (!editingMaterial) return;
    const updated = applyMaterialEdit(editingMaterial, input);
    setSnapshot((current) => ({
      ...current,
      materials: current.materials.map((item) => (item.recordId === updated.recordId ? updated : item)),
    }));
    setEditingMaterial(null);
    if (workflowMode === "connected") {
      try {
        await saveMaterial({ material: updated, writeBack: true });
      } catch (error) {
        setFriendlyError("materials.save", error);
        return;
      }
    }
    setNotice({ type: "success", message: "素材已更新" });
  }, [editingMaterial, setFriendlyError, setNotice, workflowMode]);

  const handleToggleMaterialStatus = useCallback(async (item: MaterialItem) => {
    const nextStatus =
      item.status === MATERIAL_STATUS.pending ? MATERIAL_STATUS.extracted : MATERIAL_STATUS.pending;
    const updated = { ...item, status: nextStatus };
    setSnapshot((current) => ({
      ...current,
      materials: current.materials.map((m) => (m.recordId === updated.recordId ? updated : m)),
    }));
    if (workflowMode === "connected") {
      try {
        await saveMaterial({ material: updated, writeBack: true });
      } catch (error) {
        // 写回失败：回滚本地状态，避免界面与飞书不一致
        setSnapshot((current) => ({
          ...current,
          materials: current.materials.map((m) => (m.recordId === item.recordId ? item : m)),
        }));
        setFriendlyError("materials.save", error);
        return;
      }
    }
    setNotice({ type: "success", message: `已标记为「${nextStatus}」` });
  }, [setFriendlyError, setNotice, workflowMode]);

  const handleDeleteTopic = useCallback(async (topic: ContentCard) => {
    const ok = await deleteEntityRemote("topic", topic.recordId ? [topic.recordId] : []);
    if (!ok) return;
    setSnapshot((current) => ({
      ...current,
      topics: current.topics.filter((item) => !isSameTopic(item, topic)),
    }));
    setSelectedTopic((current) => (current && current.topicId === topic.topicId ? null : current));
    setNotice({ type: "success", message: workflowMode === "connected" ? "选题已从飞书删除" : "选题已移除" });
  }, [deleteEntityRemote, setNotice, workflowMode]);

  const handleEditTopic = useCallback((topic: ContentCard) => setEditingTopic(topic), []);

  const handleSubmitEditTopic = useCallback(async (input: ManualTopicInput) => {
    if (!editingTopic) return;
    const updated = applyTopicEdit(editingTopic, input);
    setSnapshot((current) => ({
      ...current,
      topics: current.topics.map((item) =>
        (item.topicId && item.topicId === updated.topicId) ||
        (item.recordId && updated.recordId && item.recordId === updated.recordId)
          ? updated
          : item
      ),
    }));
    setSelectedTopic((current) => (current && current.topicId === updated.topicId ? updated : current));
    setEditingTopic(null);
    if (workflowMode === "connected") {
      try {
        await saveTopic({ topic: updated, writeBack: true });
      } catch (error) {
        setFriendlyError("topics.save", error);
        return;
      }
    }
    setNotice({ type: "success", message: "选题已更新" });
  }, [editingTopic, setFriendlyError, setNotice, workflowMode]);

  useEffect(() => {
    let isActive = true;

    async function bootstrapWorkflow() {
      setIsSyncing(true);
      setNotice({ type: "info", message: "正在准备工作台" });
      try {
        const bootstrap = await getWorkflowBootstrap();
        if (!isActive) return;

        setBootstrapConfig(bootstrap.config);

        if (bootstrap.mode === "demo") {
          setWorkflowMode("demo");
          applySnapshot(bootstrap.snapshot || DEMO_SNAPSHOT, DEMO_SELECTED_MATERIAL_IDS);
          setNotice({ type: "success", message: "已加载 Demo 数据，可直接体验完整闭环" });
          return;
        }

        setWorkflowMode("connected");
        // 落地页本来就是工作台（area 初始值），这里不再回设——否则会把用户
        // 在启动期间点选的区悄悄弹回来。
        await loadFeishuSnapshot();
      } catch (error) {
        if (!isActive) return;
        console.error("[WorkflowDashboard] 启动失败，切换 Demo", { action: "workflow.bootstrap", error });
        setWorkflowMode("demo");
        applySnapshot(DEMO_SNAPSHOT, DEMO_SELECTED_MATERIAL_IDS);
        setNotice({ type: "error", message: "工作流启动失败，已切换 Demo 模式" });
      } finally {
        if (isActive) setIsSyncing(false);
      }
    }

    bootstrapWorkflow();
    return () => {
      isActive = false;
    };
  }, [applySnapshot, loadFeishuSnapshot, setNotice]);

  const handleAddMaterial = useCallback((input: ManualMaterialInput) => {
    const material = createManualMaterial(input);
    setSnapshot((current) => ({ ...current, materials: [material, ...current.materials] }));
    setSelectedMaterialIds((current) => [...current, material.recordId]);
    setNotice({ type: "success", message: "已手动新增素材并选中" });
  }, [setNotice]);

  // 线索采集：把提炼出的候选批量建成本地素材并选中，走与手动新增同一条路径
  const handleAddClues = useCallback((candidates: ExtractedClue[], sourceLabel: string) => {
    if (candidates.length === 0) return;
    const materials = candidates.map((clue) =>
      createManualMaterial({
        event: clue.event,
        method: clue.method,
        pitfall: clue.pitfall,
        relatedTerm: clue.relatedTerm,
        sourceType: sourceLabel,
      })
    );
    setSnapshot((current) => ({ ...current, materials: [...materials, ...current.materials] }));
    setSelectedMaterialIds((current) => [...materials.map((item) => item.recordId), ...current]);
    setNotice({ type: "success", message: `已加入 ${materials.length} 条线索素材并选中` });
  }, [setNotice]);

  const handleAddTopic = useCallback((input: ManualTopicInput) => {
    const topic = createManualTopic(input);
    setSnapshot((current) => ({ ...current, topics: [topic, ...current.topics] }));
    setSelectedTopic(topic);
    setSelectedDraft(null);
    setNotice({ type: "success", message: "已手动新增选题并选中" });
  }, [setNotice]);

  const handleGenerateTopics = useCallback(async (targetMaterials?: MaterialItem[]) => {
    if (!hasPendingMaterials) {
      setNotice({ type: "error", message: "没有待提炼素材。请先在「本地文档入库」点「写入飞书」，再同步飞书。" });
      return;
    }
    const materials = targetMaterials ?? selectedMaterials;
    if (materials.length === 0) {
      setNotice({ type: "error", message: "请先在素材页勾选本轮要提炼的素材。" });
      return;
    }

    setIsGeneratingTopics(true);
    setNotice({ type: "info", message: `正在从 ${materials.length} 条素材提炼选题` });
    try {
      const shouldWriteBack = workflowMode === "connected";
      const result = await generateContentCards({
        count: materials.length,
        status: MATERIAL_STATUS.pending,
        writeBack: shouldWriteBack,
        materials,
        glossary: snapshot.glossary,
        signal: tasks.start("topics"),
      });
      setSnapshot((current) => ({
        ...current,
        topics: mergeByKey(current.topics, result.cards, (topic) => topic.topicId),
      }));
      setSelectedTopic(result.cards[0] || null);
      setSelectedDraft(null);
      setArea("note");
      setNotice({
        type: "success",
        message: shouldWriteBack
          ? `已生成 ${result.cards.length} 条选题并写回飞书，已打开第一条`
          : `已生成 ${result.cards.length} 条选题，已打开第一条`,
        action: { label: "看全部项目", run: () => setArea("projects") },
      });
      if (shouldWriteBack) {
        await loadFeishuSnapshot();
      }
    } catch (error) {
      if (isAbortError(error)) setNotice({ type: "info", message: "已取消生成选题" });
      else setFriendlyError("topics.generate", error);
    } finally {
      tasks.finish("topics");
      setIsGeneratingTopics(false);
    }
  }, [hasPendingMaterials, loadFeishuSnapshot, selectedMaterials, setFriendlyError, setNotice, snapshot.glossary, tasks, workflowMode]);

  const handleGenerateDraft = useCallback(async () => {
    setIsGeneratingDrafts(true);
    setNotice({ type: "info", message: "正在生成小红书草稿" });
    try {
      const shouldWriteBack = workflowMode === "connected";
      const fallbackCard = usableTopics.find((topic) => topic.status === TOPIC_STATUS.pending) || usableTopics[0];
      const result = await generateDrafts({
        count: 1,
        status: TOPIC_STATUS.pending,
        writeBack: shouldWriteBack,
        cards: selectedTopic ? [selectedTopic] : fallbackCard ? [fallbackCard] : undefined,
        signal: tasks.start("drafts"),
      });
      setSnapshot((current) => ({
        ...current,
        drafts: mergeByKey(current.drafts, result.drafts, (draft) => draft.noteId),
      }));
      setSelectedDraft(result.drafts[0] || null);
      setNotice({
        type: "success",
        message: shouldWriteBack ? "草稿已生成，并写回飞书" : "Demo 草稿已生成",
      });
      if (shouldWriteBack) {
        await loadFeishuSnapshot();
      }
    } catch (error) {
      if (isAbortError(error)) setNotice({ type: "info", message: "已取消生成草稿" });
      else setFriendlyError("drafts.generate", error);
    } finally {
      tasks.finish("drafts");
      setIsGeneratingDrafts(false);
    }
  }, [loadFeishuSnapshot, selectedTopic, setFriendlyError, setNotice, tasks, usableTopics, workflowMode]);

  // 编辑器选区改写：网络与取消统一收在 dashboard，NoteEditor 只管选区和替换
  const handleInlineRewrite = useCallback(
    async (payload: { selection: string; action: InlineRewriteAction; instruction?: string }) => {
      setIsRewritingInline(true);
      try {
        const result = await rewriteInline({
          ...payload,
          noteTitle: selectedDraft?.title || selectedTopic?.titleCandidates[0],
          painPoint: selectedTopic?.painPoint,
          bloggerId: selectedTopic ? topicDaokuMap[selectedTopic.topicId] : undefined,
          signal: tasks.start("inlineRewrite"),
        });
        setNotice({
          type: result.usedFallback ? "info" : "success",
          message: result.usedFallback ? "未配置 AI，已按规则兜底处理" : "已改写选中内容，可点「撤销改写」还原",
        });
        return result.text;
      } catch (error) {
        if (isAbortError(error)) setNotice({ type: "info", message: "已取消改写" });
        else setFriendlyError("rewrite.inline", error);
        return null;
      } finally {
        tasks.finish("inlineRewrite");
        setIsRewritingInline(false);
      }
    },
    [selectedDraft, selectedTopic, setFriendlyError, setNotice, tasks, topicDaokuMap]
  );

  const handleSaveDraft = useCallback(async (draft: DraftNote) => {
    setIsSavingDraft(true);
    setNotice({ type: "info", message: "正在保存草稿修改" });
    try {
      const shouldWriteBack = workflowMode === "connected";
      const result = await saveDraft({ draft, writeBack: shouldWriteBack });
      setSnapshot((current) => ({
        ...current,
        drafts: mergeByKey(current.drafts, [result.draft], (item) => item.noteId),
      }));
      setSelectedDraft(result.draft);
      setNotice({ type: "success", message: shouldWriteBack ? "草稿修改已写回飞书" : "Demo 草稿已保存" });
      if (shouldWriteBack) {
        await loadFeishuSnapshot();
      }
    } catch (error) {
      setFriendlyError("drafts.save", error);
    } finally {
      setIsSavingDraft(false);
    }
  }, [loadFeishuSnapshot, setFriendlyError, setNotice, workflowMode]);

  const handlePublishDraft = useCallback(async (draft: DraftNote) => {
    setIsPublishingDraft(true);
    setNotice({ type: "info", message: "正在标记发布并准备复盘记录" });
    try {
      const shouldWriteBack = workflowMode === "connected";
      const result = await publishDraft({ draft, writeBack: shouldWriteBack });
      setSnapshot((current) => ({
        ...current,
        drafts: mergeByKey(current.drafts, [result.draft], (item) => item.noteId),
        metrics: mergeByKey(current.metrics, [result.reviewMetric], (item) => item.noteId),
      }));
      setSelectedDraft(result.draft);
      setNotice({
        type: "success",
        message: shouldWriteBack ? "草稿已发布，复盘记录已创建" : "Demo 草稿已发布",
      });
      if (shouldWriteBack) {
        await loadFeishuSnapshot();
      }
    } catch (error) {
      setFriendlyError("drafts.publish", error);
    } finally {
      setIsPublishingDraft(false);
    }
  }, [loadFeishuSnapshot, setFriendlyError, setNotice, workflowMode]);

  // 质检面板里「标签重配 / 引导重写」内联编辑：只改前端当前草稿，不写回飞书；
  // 之后在中栏点「保存」可一并写回。
  const handlePatchDraft = useCallback(
    (patch: Partial<DraftNote>) => {
      if (!selectedDraft) return;
      const next = { ...selectedDraft, ...patch };
      setSelectedDraft(next);
      setSnapshot((current) => ({
        ...current,
        drafts: current.drafts.map((item) => (isSameDraft(item, next) ? next : item)),
      }));
    },
    [selectedDraft]
  );

  const handleGenerateCover = useCallback(async () => {
    const sourceDraft = selectedDraft;
    const sourceTopic = selectedTopic;
    if (!sourceDraft && !sourceTopic) {
      setNotice({ type: "error", message: "请先选择选题或草稿" });
      return;
    }

    setIsGeneratingCover(true);
    setNotice({ type: "info", message: "正在生成封面方案" });
    try {
      const shouldWriteBack = workflowMode === "connected";
      const signal = tasks.start("cover");
      const result = shouldWriteBack && sourceDraft?.recordId
        ? await generateCover({
            sourceType: "draft",
            recordId: sourceDraft.recordId,
            writeBack: true,
            signal,
          })
        : shouldWriteBack && sourceTopic?.recordId
          ? await generateCover({
              sourceType: "topic",
              recordId: sourceTopic.recordId,
              writeBack: true,
              signal,
            })
          : await generateCover({
              input: sourceDraft ? draftToCoverInput(sourceDraft) : topicToCoverInput(sourceTopic as ContentCard),
              writeBack: false,
              signal,
            });

      setCoverPlan(result.plan);
      setCoverConfig(result.coverConfig);
      setCoverDataUrl(result.coverImageDataUrl || "");
      if (sourceDraft) {
        const updatedDraft = applyCoverMetadata(sourceDraft, result.plan, result.coverConfig);
        setSnapshot((current) => ({
          ...current,
          drafts: current.drafts.map((draft) => (isSameDraft(draft, sourceDraft) ? updatedDraft : draft)),
        }));
        setSelectedDraft(updatedDraft);
      } else if (sourceTopic) {
        const updatedTopic = applyCoverMetadata(sourceTopic, result.plan, result.coverConfig);
        setSnapshot((current) => ({
          ...current,
          topics: current.topics.map((topic) => (isSameTopic(topic, sourceTopic) ? updatedTopic : topic)),
        }));
        setSelectedTopic(updatedTopic);
      }
      setNotice({ type: "success", message: result.usedFallback ? "已用规则生成封面方案" : "封面方案已生成" });
      if (result.writeBack) {
        await loadFeishuSnapshot();
      }
    } catch (error) {
      if (isAbortError(error)) setNotice({ type: "info", message: "已取消生成封面" });
      else setFriendlyError("covers.generate", error);
    } finally {
      tasks.finish("cover");
      setIsGeneratingCover(false);
    }
  }, [loadFeishuSnapshot, selectedDraft, selectedTopic, setFriendlyError, setNotice, tasks, workflowMode]);

  const handleGenerateContentImage = useCallback(async () => {
    const sourceDraft = selectedDraft;
    const sourceTopic = selectedTopic;
    if (!sourceDraft && !sourceTopic) {
      setNotice({ type: "error", message: "请先选择选题或草稿" });
      return;
    }

    setIsGeneratingContentImage(true);
    setContentImageDataUrl("");
    setNotice({ type: "info", message: "正在生成内容配图" });
    try {
      const input = sourceDraft
        ? draftToImageSourceInput(sourceDraft)
        : contentCardToImageSourceInput(sourceTopic as ContentCard);
      const result = await generateImageAsset({
        kind: "content",
        input,
        templateType: contentImageTemplate,
        signal: tasks.start("contentImage"),
      });
      setContentImagePlan(result.plan);
      setImageTab("content");
      setNotice({
        type: "success",
        message: result.usedFallback ? "已用规则生成内容配图" : "内容配图已生成",
      });
    } catch (error) {
      if (isAbortError(error)) setNotice({ type: "info", message: "已取消生成配图" });
      else setFriendlyError("images.generateContent", error);
    } finally {
      tasks.finish("contentImage");
      setIsGeneratingContentImage(false);
    }
  }, [contentImageTemplate, selectedDraft, selectedTopic, setFriendlyError, setNotice, tasks]);

  const handleGenerateReview = useCallback(async () => {
    setIsReviewing(true);
    setNotice({ type: "info", message: "正在复盘已发布笔记数据" });
    try {
      const shouldWriteBack = workflowMode === "connected";
      const result = await generateReview({
        writeBack: shouldWriteBack,
        metrics: shouldWriteBack ? undefined : publishedMetrics,
        signal: tasks.start("review"),
      });
      setReview(result.review);
      setNotice({
        type: "success",
        message: shouldWriteBack ? "复盘已生成，并写回飞书" : "Demo 复盘已生成",
      });
      if (shouldWriteBack) {
        await loadFeishuSnapshot();
      }
    } catch (error) {
      if (isAbortError(error)) setNotice({ type: "info", message: "已取消生成复盘" });
      else setFriendlyError("review.generate", error);
    } finally {
      tasks.finish("review");
      setIsReviewing(false);
    }
  }, [loadFeishuSnapshot, publishedMetrics, setFriendlyError, setNotice, tasks, workflowMode]);

  const handleDownloadCover = useCallback(() => {
    if (!coverDataUrl) {
      setNotice({ type: "error", message: "请先在图片工厂的封面页生成预览图" });
      return;
    }
    downloadCover(coverDataUrl, `xhs-cover-${Date.now()}.png`);
    setNotice({ type: "success", message: "封面已下载，可以进入发布和数据回流" });
  }, [coverDataUrl, setNotice]);

  const handleDownloadContentImage = useCallback(() => {
    if (!contentImageDataUrl) {
      setNotice({ type: "error", message: "请先生成内容配图" });
      return;
    }
    downloadImageAsset(contentImageDataUrl, `xhs-content-image-${Date.now()}.png`);
    setNotice({ type: "success", message: "内容配图已下载" });
  }, [contentImageDataUrl, setNotice]);

  const handleContentTemplateChange = useCallback((templateType: ContentImageTemplateType) => {
    setContentImageTemplate(templateType);
    setContentImagePlan(null);
    setContentImageDataUrl("");
  }, []);

  const handleApplyRewriteToDraft = useCallback((draft: DraftNote) => {
    setSnapshot((current) => ({
      ...current,
      drafts: mergeByKey(current.drafts, [draft], (item) => item.noteId),
    }));
    setSelectedDraft(draft);
    setNotice({ type: "success", message: "改写结果已应用到当前草稿" });
  }, [setNotice]);

  // 选一篇笔记：带出它的草稿，并清掉上一篇的封面/配图预览
  const handleSelectNote = useCallback((topic: ContentCard) => {
    setSelectedTopic(topic);
    setSelectedDraft(usableDrafts.find((item) => item.topicId === topic.topicId) || null);
    setCoverPlan(null);
    setCoverDataUrl("");
    setContentImagePlan(null);
    setContentImageDataUrl("");
  }, [usableDrafts]);

  // 「最近使用」是本机偏好，挂载后再读，避免服务端渲染时读 localStorage
  useEffect(() => {
    setRecent(readRecent());
  }, []);

  // 打开一个区并记一笔「最近使用」。结构页（首页/目录/项目）不算「用过一个工具」，不记。
  const openArea = useCallback((id: AreaId) => {
    setArea(id);
    if (AREAS[id].category) setRecent(pushRecent("area", id));
  }, []);

  const refreshVideoProjects = useCallback(async () => {
    try {
      const data = await listVideoProjects();
      setVideoProjects(data.projects);
    } catch (error) {
      console.error("[WorkflowDashboard] 视频项目列表读取失败", { action: "projects.videoList", error });
    }
  }, []);

  // 挂载即拉、每次切区顺手刷新：⌘K 与项目页共用这一份列表，从工厂出来它就该是新的
  useEffect(() => {
    refreshVideoProjects();
  }, [area, refreshVideoProjects]);

  // 项目页/⌘K 点开视频项目、全局创建视频项目：都落到视频工厂（走 openArea，「最近使用」不漏记），谁接住谁清
  const openVideoProject = useCallback(
    (project: VideoProject) => {
      setPendingVideoProject(project);
      setProjectLane("video");
      openArea("videoFactory");
    },
    [openArea],
  );

  const createVideoProject = useCallback(() => {
    setPendingFreshVideo(true);
    setProjectLane("video");
    openArea("videoFactory");
  }, [openArea]);

  /**
   * 模板目录点「照这个做」：按模板类型送进对应的工厂。
   * 模板目录是挑模板的唯一入口，工厂只负责跑，所以分发只有这一处。
   */
  const openTemplate = useCallback((card: TemplateCard) => {
    // 落哪个区由 templateTarget 说了算，这里只把工厂起手要的东西交出去
    if (card.kind === "rhythm") setPendingRhythm(card.rhythm);
    else setPendingTemplateId(card.id);
    setArea(templateTarget(card));
    setRecent(pushRecent("template", card.id));
  }, []);

  // 打开一篇笔记：选中它并进详情页，列表与详情是两级，选中即跳转
  const openNote = useCallback(
    (topic: ContentCard) => {
      handleSelectNote(topic);
      setArea("note");
    },
    [handleSelectNote],
  );

  /**
   * 路由结果的唯一落地口：换区、挂页顶横幅、给目标工具递起手参数。
   * 打字（AI 判）和示例 chip（关键词判）都走这里，将来新增 pending* 交接只用改这一处。
   */
  const applyIntent = useCallback(
    // area 收 string 而不是 AreaId：AI 路径回来的是未经校验的模型输出，验区正是这里的活
    (result: { area: string; reason: string; brief: string; url: string }): boolean => {
      const target = ROUTABLE_AREAS.find((id) => id === result.area);
      if (!target) return false;
      openArea(target);
      setHandoff({ area: target, brief: result.brief, reason: result.reason });
      // 只把目标工具真接得住的那一样递过去，接不住的不硬塞
      if (target === "extract" && result.url) setPendingExtractUrl(result.url);
      if (target === "images") setPendingImageBrief(result.brief);
      if (target === "videoFactory") setPendingVideoTopic(result.brief);
      // 成功时不再弹 toast：页面已经换了、页顶横幅也写着本次要求，
      // 再飘一条说同一件事的绿条，等于同一句话说三遍
      return true;
    },
    [openArea],
  );

  // 首页输入框：一句话判去哪个区。后端判不出来时已回落到关键词规则，这里只兜「回了个不认识的区」。
  const handleRouteIntent = useCallback(
    async (text: string) => {
      setIsRoutingIntent(true);
      try {
        const result = await routeIntent(text);
        if (!applyIntent(result)) {
          setNotice({ type: "error", message: "没看懂这句话要做什么，换个说法或从下面挑一个入口" });
        }
      } catch (error) {
        setFriendlyError("意图识别", error);
      } finally {
        setIsRoutingIntent(false);
      }
    },
    [applyIntent, setFriendlyError, setNotice],
  );

  // 示例 chip：意图是现成的，本地关键词就判得动，不必花一次 AI 往返
  const handlePickExample = useCallback(
    (text: string) => {
      applyIntent(routeByKeyword(text));
    },
    [applyIntent],
  );

  const boundDaokuName = DAOKU_OPTIONS.find(
    (option) => option.bloggerId === topicDaokuMap[selectedTopic?.topicId || ""]
  )?.name;
  const bloggerReady = Boolean(bloggerDistillation);
  const videoReady = Boolean(videoPlan);

  // 当前笔记在内容管线上的位置。顺序即流程，节点可直接跳到对应的区。
  const pipelineSteps: PipelineStep[] = useMemo(() => {
    const published = Boolean(selectedDraft && isPublishedDraft(selectedDraft));
    return [
      { id: "topic", label: "选题", done: Boolean(selectedTopic) },
      { id: "draft", label: "草稿", done: Boolean(selectedDraft) },
      { id: "cover", label: "封面", done: Boolean(coverDataUrl), onSelect: openCover },
      {
        id: "quality",
        label: "质检",
        done: Boolean(selectedDraft && qualityResult && !qualityResult.hardFail),
        onSelect: () => setArea("quality"),
      },
      { id: "publish", label: "发布", done: published },
    ];
  }, [selectedTopic, selectedDraft, coverDataUrl, qualityResult, openCover]);

  // ⌘K 命令表：分区跳转 + 笔记切换 + 高频动作，全部收在一个入口
  const commands: Command[] = useMemo(() => {
    const areaCommands: Command[] = COMMAND_AREAS.map((id) => ({
      id: `area-${id}`,
      group: "跳转",
      label: AREAS[id].label,
      hint: AREAS[id].hint,
      keywords: AREAS[id].subtitle,
      icon: <NavIcon id={id} size={15} />,
      run: () => openArea(id),
    }));

    const noteCommands: Command[] = usableTopics.slice(0, 30).map((topic) => ({
      id: `note-${topic.topicId || topic.recordId}`,
      group: "项目",
      label: topic.titleCandidates[0] || topic.coreViewpoint || "未命名项目",
      hint: getNoteStatus(topic, usableDrafts),
      keywords: topic.painPoint,
      icon: <FileText size={15} />,
      run: () => openNote(topic),
    }));

    const videoProjectCommands: Command[] = videoProjects.slice(0, 20).map((project) => ({
      id: `video-project-${project.id}`,
      group: "项目",
      label: project.title,
      hint: describeProjectProgress(project),
      icon: <NavIcon id="videoFactory" size={15} />,
      run: () => openVideoProject(project),
    }));

    const actionCommands: Command[] = [
      {
        id: "action-new-note",
        group: "动作",
        label: "新建图文项目",
        icon: <Plus size={15} />,
        run: () => setAddingTopic(true),
      },
      {
        id: "action-new-video-project",
        group: "动作",
        label: "新建视频项目",
        icon: <Plus size={15} />,
        run: createVideoProject,
      },
      {
        id: "action-sync",
        group: "动作",
        label: workflowMode === "demo" ? "重载 Demo" : "同步飞书",
        icon: <RefreshCw size={15} />,
        run: loadSnapshot,
      },
      {
        id: "action-generate-draft",
        group: "动作",
        label: "生成草稿",
        hint: selectedTopic ? undefined : "先选一个项目",
        icon: <Sparkles size={15} />,
        run: () => {
          if (!selectedTopic) {
            setNotice({ type: "error", message: "先选一个项目再生成草稿" });
            setArea("projects");
            return;
          }
          setArea("note");
          handleGenerateDraft();
        },
      },
      {
        id: "action-generate-cover",
        group: "动作",
        label: "生成封面方案",
        icon: <Sparkles size={15} />,
        run: () => {
          openCover();
          handleGenerateCover();
        },
      },
    ];

    return [...areaCommands, ...noteCommands, ...videoProjectCommands, ...actionCommands];
  }, [
    createVideoProject,
    handleGenerateCover,
    handleGenerateDraft,
    loadSnapshot,
    openArea,
    openCover,
    openNote,
    openVideoProject,
    selectedTopic,
    setNotice,
    usableDrafts,
    usableTopics,
    videoProjects,
    workflowMode,
  ]);

  return (
    <>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
      <WorkbenchShell
        area={area}
        onAreaChange={openArea}
        onCreateNote={() => setAddingTopic(true)}
        onCreateVideo={createVideoProject}
        workflowMode={workflowMode}
        aiProvider={bootstrapConfig?.aiProvider ?? null}
        syncing={isSyncing}
        syncLabel={workflowMode === "demo" ? "重载 Demo" : "同步飞书"}
        onSync={loadSnapshot}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        plain={PLAIN_AREAS.includes(area)}
        banner={
          handoff?.area === area ? (
            <HandoffBanner brief={handoff.brief} reason={handoff.reason} onDismiss={() => setHandoff(null)} />
          ) : null
        }
      >
        {area === "home" && (
          <HomeHub
            onOpenArea={openArea}
            onOpenTemplate={openTemplate}
            onSubmitIntent={handleRouteIntent}
            onPickExample={handlePickExample}
            intentPending={isRoutingIntent}
            recent={recent}
          />
        )}

        {area === "tools" && <ToolsGallery recent={recent} onOpenArea={openArea} />}

        {area === "templates" && (
          <TemplateGallery recent={recent} onOpenArea={openArea} onOpenTemplate={openTemplate} />
        )}

        {area === "assets" && (
          <CanvasPage title={AREAS.assets.label} subtitle={AREAS.assets.subtitle}>
            <AssetLibrary onNotice={setNotice} onUseAssets={() => openArea("templates")} />
          </CanvasPage>
        )}

        {area === "works" && (
          <CanvasPage title={AREAS.works.label} subtitle={AREAS.works.subtitle}>
            <WorksLibrary onNotice={setNotice} />
          </CanvasPage>
        )}

        {area === "projects" && (
          <ProjectList
            notes={usableTopics}
            drafts={usableDrafts}
            selectedTopicId={selectedTopic?.topicId ?? null}
            lane={projectLane}
            onLaneChange={setProjectLane}
            onSelect={openNote}
            onNew={() => setAddingTopic(true)}
            onGenerateFromMaterials={() => openArea("library")}
            videoProjects={videoProjects}
            onSelectVideoProject={openVideoProject}
            onNewVideoProject={createVideoProject}
          />
        )}

        {area === "note" && (
          <div className="flex h-full flex-col">
            <div className="shrink-0 border-b border-line bg-surface px-4 py-3 md:px-6">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setArea("projects")}
                  icon={<ArrowLeft size={15} />}
                >
                  项目
                </Button>
                <div className="min-w-0 flex-1">
                  <PageHeader
                    variant="bar"
                    title={AREAS.note.label}
                    subtitle={
                      selectedTopic
                        ? selectedTopic.titleCandidates[0] || selectedTopic.coreViewpoint
                        : AREAS.note.subtitle
                    }
                    action={
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setAddingTopic(true)}
                        icon={<Plus size={14} strokeWidth={2.6} />}
                      >
                        新建项目
                      </Button>
                    }
                  />
                </div>
              </div>
              {selectedTopic && (
                <div className="mt-3 overflow-x-auto pb-0.5">
                  <PipelineRail steps={pipelineSteps} />
                </div>
              )}
            </div>
            {selectedTopic || selectedDraft ? (
              <div className="flex min-h-0 flex-1">
                <div className="min-w-0 flex-1">
                  <NoteEditor
                    selectedTopic={selectedTopic}
                    selectedDraft={selectedDraft}
                    boundDaokuName={boundDaokuName}
                    isGenerating={isGeneratingDrafts}
                    isSaving={isSavingDraft}
                    onGenerateDraft={handleGenerateDraft}
                    onCancelGenerate={() => tasks.cancel("drafts")}
                    onInlineRewrite={handleInlineRewrite}
                    onCancelInlineRewrite={() => tasks.cancel("inlineRewrite")}
                    isRewriting={isRewritingInline}
                    onSaveDraft={handleSaveDraft}
                    onOpenRewrite={() => openArea("rewrite")}
                  />
                </div>
                <div className="hidden w-80 shrink-0 border-l border-line lg:block">
                  <NoteInspector
                    topic={selectedTopic}
                    draft={selectedDraft}
                    onEditTopic={() => selectedTopic && handleEditTopic(selectedTopic)}
                    onDeleteTopic={() => selectedTopic && handleDeleteTopic(selectedTopic)}
                    sourceSummary={selectedTopic?.sourceMaterial || ""}
                    onOpenLibrary={() => openArea("library")}
                    daokuOptions={DAOKU_OPTIONS}
                    topicDaokuMap={topicDaokuMap}
                    onBindDaoku={handleBindDaoku}
                    bloggerReady={bloggerReady}
                    onOpenBlogger={() => openArea("blogger")}
                    coverDataUrl={coverDataUrl}
                    onOpenCover={openCover}
                    videoReady={videoReady}
                    onOpenVideo={() => openArea("video")}
                    quality={qualityResult}
                    onOpenQuality={() => openArea("quality")}
                    onPublish={() => {
                      if (selectedDraft) handlePublishDraft(selectedDraft);
                    }}
                    publishing={isPublishingDraft}
                  />
                </div>
              </div>
            ) : (
              <EmptyNote hint="还没选中项目" onGoProjects={() => setArea("projects")} />
            )}
          </div>
        )}

        {area === "library" && (
          <CanvasPage
            title={AREAS.library.label}
            subtitle={AREAS.library.subtitle}
            action={
              <div className="flex items-center gap-2">
                {isGeneratingTopics && (
                  <Button variant="ghost" onClick={() => tasks.cancel("topics")}>
                    取消
                  </Button>
                )}
                <Button
                  variant="ai"
                  onClick={() => handleGenerateTopics()}
                  disabled={selectedMaterials.length === 0}
                  loading={isGeneratingTopics}
                  icon={<Sparkles size={16} />}
                >
                  {isGeneratingTopics ? "生成中" : `生成选题（${selectedMaterials.length}）`}
                </Button>
              </div>
            }
          >
            <div className="mt-6 space-y-3">
              <WorkflowOnboarding
                mode={workflowMode}
                config={bootstrapConfig}
                onUseDemo={handleUseDemo}
                onLoadMarkdown={handleLoadMarkdownDemo}
                onConnectFeishu={handleConnectFeishu}
                onOpenSource={() => setArea("projects")}
                onDismiss={() => setArea("projects")}
              />
              <CollapsiblePanel title="录入与提炼" hint="线索采集、选题池、本地文档——三选一导入">
                <div className="space-y-3 p-5">
                  <p className="text-sm leading-6 text-muted">
                    勾选下方素材，点右上「生成选题」即可提炼——每条选题就是一篇新的图文项目。已选{" "}
                    <span className="font-rounded font-bold tabular-nums text-ink">{selectedMaterials.length}</span> 条。
                  </p>
                  <SegmentedControl
                    value={intakeTab}
                    onChange={setIntakeTab}
                    ariaLabel="导入方式"
                    options={[
                      { value: "clue", label: "X / GitHub 线索" },
                      { value: "pool", label: "从选题池" },
                      { value: "docs", label: "本地文档" },
                    ]}
                  />
                  <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
                    {intakeTab === "clue" && (
                      <ClueIntakePanel headless onClues={handleAddClues} onNotice={setNotice} />
                    )}
                    {intakeTab === "pool" && (
                      <TopicPoolImportPanel
                        headless
                        defaultSourceDir={topicPoolDir}
                        isFeishuReady={isFeishuReady}
                        onNotice={setNotice}
                        onImported={loadSnapshot}
                      />
                    )}
                    {intakeTab === "docs" && (
                      <LocalDocsSyncPanel
                        headless
                        defaultSourceDir={localDocsSourceDir}
                        isFeishuReady={isFeishuReady}
                        onNotice={setNotice}
                        onImported={loadSnapshot}
                      />
                    )}
                  </div>
                </div>
              </CollapsiblePanel>
              <SourceWorkspace
                materials={snapshot.materials}
                selectedMaterialIds={selectedMaterialIds}
                isFeishuReady={isFeishuReady}
                onToggleMaterial={handleToggleMaterial}
                onSelectPendingMaterials={handleSelectPendingMaterials}
                onClearSelectedMaterials={handleClearSelectedMaterials}
                onAdd={() => setAddingMaterial(true)}
                onEditMaterial={handleEditMaterial}
                onDeleteMaterial={handleDeleteMaterial}
                onBatchDeleteMaterials={handleBatchDeleteMaterials}
                onExtractMaterial={(item) => handleGenerateTopics([item])}
                onToggleMaterialStatus={handleToggleMaterialStatus}
                onNotice={setNotice}
              />
            </div>
          </CanvasPage>
        )}

        {area === "review" && (
          <ToolScroll>
            <PageHeader title={AREAS.review.label} subtitle={AREAS.review.subtitle} />
            <ReviewDashboard
              metrics={publishedMetrics}
              review={review}
              onGenerate={handleGenerateReview}
              onCancel={() => tasks.cancel("review")}
              generating={isReviewing}
            />
          </ToolScroll>
        )}

        {area === "images" && (
          // AI 生图不针对某一篇笔记，不传 note 就不显示「当前笔记」条
          <ToolPage area="images" subtitle={AI_IMAGE_SUBTITLE} onGoProjects={() => setArea("projects")}>
            <ImageFactory
              incomingTemplateId={pendingTemplateId}
              onTemplateConsumed={() => setPendingTemplateId(null)}
              onBackToTemplates={() => setArea("templates")}
              incomingBrief={pendingImageBrief}
              onBriefConsumed={() => setPendingImageBrief(null)}
              onUseAsCover={(dataUrl) => {
                // AI 只出底图，标题仍由本地排版叠上去：底图落进封面配置的背景位，再转去叠字
                setCoverConfig((current) => ({ ...current, backgroundImage: dataUrl }));
                openCover();
              }}
            />
          </ToolPage>
        )}

        {area === "textLayer" && (
          <ToolPage
            area="textLayer"
            note={selectedTopic}
            subtitle={TEXT_LAYER_TABS.find((tab) => tab.value === imageTab)?.subtitle}
            onGoProjects={() => setArea("projects")}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => setArea("images")} icon={<ArrowLeft size={15} />}>
                去 AI 生图
              </Button>
              <SegmentedControl
                options={TEXT_LAYER_OPTIONS}
                value={imageTab}
                onChange={setImageTab}
                ariaLabel="叠字类型"
              />
            </div>
            <div className="space-y-3">
                <CoverStudio
                  topics={usableTopics}
                  drafts={usableDrafts}
                  selectedTopic={selectedTopic}
                  selectedDraft={selectedDraft}
                  coverConfig={coverConfig}
                  coverPlan={coverPlan}
                  imageMode={imageTab}
                  contentImageTemplate={contentImageTemplate}
                  contentImagePlan={contentImagePlan}
                  contentImageDataUrl={contentImageDataUrl}
                  isGenerating={isGeneratingCover}
                  isGeneratingContentImage={isGeneratingContentImage}
                  onGenerateCover={handleGenerateCover}
                  onGenerateContentImage={handleGenerateContentImage}
                  onCancelGenerate={() => {
                    tasks.cancel("cover");
                    tasks.cancel("contentImage");
                  }}
                  onSelectTopic={handleSelectTopic}
                  onSelectDraft={handleSelectDraft}
                  onConfigChange={setCoverConfig}
                  onCoverGenerated={setCoverDataUrl}
                  onContentTemplateChange={handleContentTemplateChange}
                  onContentImageGenerated={setContentImageDataUrl}
                />
                {(coverDataUrl || contentImageDataUrl) && (
                  <div className="flex flex-wrap gap-2">
                    {coverDataUrl && (
                      <Button variant="secondary" onClick={handleDownloadCover} icon={<Download size={15} />}>
                        下载封面
                      </Button>
                    )}
                    {contentImageDataUrl && (
                      <Button variant="secondary" onClick={handleDownloadContentImage} icon={<Download size={15} />}>
                        下载配图
                      </Button>
                    )}
                  </div>
                )}
            </div>
          </ToolPage>
        )}

        {area === "video" && (
          <ToolPage
            area="video"
            note={selectedTopic}
            ready={Boolean(selectedTopic || selectedDraft)}
            emptyHint="做视频前，先去项目页选一个项目。"
            onGoProjects={() => setArea("projects")}
          >
            <VideoStudio
              selectedTopic={selectedTopic}
              selectedDraft={selectedDraft}
              bloggerDistillation={bloggerDistillation}
              onVideoPlanChange={setVideoPlan}
              imageUrls={[coverDataUrl, contentImageDataUrl].filter(Boolean)}
              onRenderedChange={setVideoRendered}
            />
          </ToolPage>
        )}

        {area === "rewrite" && (
          <ToolPage
            area="rewrite"
            note={selectedTopic}
            ready={Boolean(selectedTopic || selectedDraft)}
            emptyHint="改写前，先去项目页选一个项目。"
            onGoProjects={() => setArea("projects")}
          >
            <RewriteStudio
              selectedTopic={selectedTopic}
              selectedDraft={selectedDraft}
              bloggerDistillation={getDaokuForTopic(selectedTopic)}
              onApplyToDraft={handleApplyRewriteToDraft}
            />
          </ToolPage>
        )}

        {area === "blogger" && (
          <ToolPage area="blogger" onGoProjects={() => setArea("projects")}>
            <BloggerResearch
              selectedDistillation={bloggerDistillation}
              onDistillationChange={setBloggerDistillation}
            />
          </ToolPage>
        )}

        {area === "videoFactory" && (
          <ToolPage area="videoFactory" onGoProjects={() => setArea("projects")}>
            <VideoFactory
              onNotice={setNotice}
              incomingSkeleton={videoSkeleton}
              onSkeletonConsumed={() => setVideoSkeleton(null)}
              incomingRhythm={pendingRhythm}
              onRhythmConsumed={() => setPendingRhythm(null)}
              incomingTopic={pendingVideoTopic}
              onTopicConsumed={() => setPendingVideoTopic(null)}
              incomingProject={pendingVideoProject}
              onProjectConsumed={() => setPendingVideoProject(null)}
              incomingFresh={pendingFreshVideo}
              onFreshConsumed={() => setPendingFreshVideo(false)}
            />
          </ToolPage>
        )}

        {area === "extract" && (
          <ToolPage area="extract" onGoProjects={() => setArea("projects")}>
            <VideoExtractPanel
              onNotice={setNotice}
              incomingUrl={pendingExtractUrl}
              onUrlConsumed={() => setPendingExtractUrl(null)}
              onSinkToDaoku={setBloggerDistillation}
              onGoBlogger={() => setArea("blogger")}
              onSendToVideoFactory={(skeleton) => {
                setVideoSkeleton(skeleton);
                openArea("videoFactory");
              }}
            />
          </ToolPage>
        )}

        {area === "watermark" && (
          <ToolPage area="watermark" onGoProjects={() => setArea("projects")}>
            <WatermarkStudio />
          </ToolPage>
        )}

        {area === "quality" && (
          <ToolPage
            area="quality"
            note={selectedTopic}
            ready={Boolean(selectedDraft)}
            emptyHint="质检需要一篇草稿，先在工作台生成草稿。"
            onGoProjects={() => setArea("projects")}
          >
            <QualityGate
              result={qualityResult}
              draft={selectedDraft}
              onApplyDraftPatch={handlePatchDraft}
              onResolve={(action) => {
                if (action === "rewrite") setArea("rewrite");
                else if (action === "cover") openCover();
                else if (action === "source") setArea("library");
              }}
              onPublish={() => {
                if (selectedDraft) handlePublishDraft(selectedDraft);
              }}
              publishing={isPublishingDraft}
            />
          </ToolPage>
        )}
      </WorkbenchShell>

      <ManualEntryForm
        open={Boolean(editingMaterial)}
        onOpenChange={(open) => {
          if (!open) setEditingMaterial(null);
        }}
        asModal
        title="编辑素材"
        submitLabel="保存修改"
        fields={MATERIAL_FIELDS}
        initialValues={
          editingMaterial
            ? {
                event: editingMaterial.event || editingMaterial.summary,
                method: editingMaterial.method,
                sourceType: editingMaterial.sourceType,
                pitfall: editingMaterial.pitfall,
                relatedTerm: editingMaterial.relatedTerm,
              }
            : undefined
        }
        onSubmit={(values) =>
          handleSubmitEditMaterial({
            event: values.event,
            method: values.method,
            sourceType: values.sourceType,
            pitfall: values.pitfall,
            relatedTerm: values.relatedTerm,
          })
        }
      />

      <ManualEntryForm
        open={Boolean(editingTopic)}
        onOpenChange={(open) => {
          if (!open) setEditingTopic(null);
        }}
        asModal
        title="编辑选题"
        submitLabel="保存修改"
        fields={TOPIC_FIELDS}
        initialValues={
          editingTopic
            ? {
                title: editingTopic.titleCandidates[0] || "",
                coreViewpoint: editingTopic.coreViewpoint,
                painPoint: editingTopic.painPoint,
                targetReader: editingTopic.targetReader,
                realCase: editingTopic.realCase,
                reusableAsset: editingTopic.reusableAsset,
              }
            : undefined
        }
        onSubmit={(values) =>
          handleSubmitEditTopic({
            title: values.title,
            coreViewpoint: values.coreViewpoint,
            painPoint: values.painPoint,
            targetReader: values.targetReader,
            realCase: values.realCase,
            reusableAsset: values.reusableAsset,
          })
        }
      />

      <ManualEntryForm
        open={addingMaterial}
        onOpenChange={setAddingMaterial}
        asModal
        title="新增素材"
        submitLabel="加入素材库"
        fields={MATERIAL_FIELDS}
        onSubmit={(values) =>
          handleAddMaterial({
            event: values.event,
            method: values.method,
            sourceType: values.sourceType,
            pitfall: values.pitfall,
            relatedTerm: values.relatedTerm,
          })
        }
      />

      <ManualEntryForm
        open={addingTopic}
        onOpenChange={setAddingTopic}
        asModal
        title="新建项目（选题）"
        submitLabel="创建"
        fields={TOPIC_FIELDS}
        onSubmit={(values) =>
          handleAddTopic({
            title: values.title,
            coreViewpoint: values.coreViewpoint,
            painPoint: values.painPoint,
            targetReader: values.targetReader,
            realCase: values.realCase,
            reusableAsset: values.reusableAsset,
          })
        }
      />
    </>
  );
}
