"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import CoverStudio from "@/components/workflow/CoverStudio";
import TopicPoolImportPanel from "@/components/workflow/TopicPoolImportPanel";
import ClueIntakePanel from "@/components/workflow/ClueIntakePanel";
import ReviewDashboard from "@/components/workflow/ReviewDashboard";
import WorkflowOnboarding from "@/components/workflow/WorkflowOnboarding";
import BloggerResearch from "@/components/workflow/BloggerResearch";
import RewriteStudio from "@/components/workflow/RewriteStudio";
import VideoStudio from "@/components/workflow/VideoStudio";
import WorkbenchShell, { type WorkbenchAreaId, type WorkbenchNavGroup } from "@/components/workflow/WorkbenchShell";
import PageHeader from "@/components/workflow/PageHeader";
import NoteList from "@/components/workflow/NoteList";
import NoteEditor from "@/components/workflow/NoteEditor";
import NoteInspector from "@/components/workflow/NoteInspector";
import QualityGate from "@/components/workflow/QualityGate";
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
  publishDraft,
  saveDraft,
  saveMaterial,
  saveTopic,
  syncWorkflowData,
  type DeletableKind,
  type WorkflowBootstrapResult,
  type WorkflowMode,
  type WorkflowSnapshot,
} from "@/lib/workflowClient";
import type { VideoPlan } from "@/lib/videoWorkflow";
import SourceWorkspace from "./SourceWorkspace";
import type { Notice } from "./types";

// 对标博主道库选项：源自模块常量，全程不变，提到组件外避免每次渲染重建
const DAOKU_OPTIONS = DEMO_BLOGGER_PROFILES.map((profile) => ({ bloggerId: profile.id, name: profile.name }));

// 每个区的单一事实源（按 id 收敛）：所属分组、侧栏标签 / 副标题、页头副标题。
// 侧栏导航与页头标题都从这里派生，杜绝「nav 标签 ≠ 页头标题」的漂移。
type AreaGroup = "内容流程" | "制作工具";
interface AreaDef {
  group: AreaGroup;
  label: string;
  hint?: string;
  subtitle: string;
}
const AREAS: Record<WorkbenchAreaId, AreaDef> = {
  workbench: { group: "内容流程", label: "工作台", hint: "写笔记 · 从选题到发布", subtitle: "选一篇笔记，从选题到发布一条龙" },
  library: { group: "内容流程", label: "素材库", hint: "攒料 · 出选题", subtitle: "攒料、提炼、导入——所有选题的来源。" },
  review: { group: "内容流程", label: "复盘", hint: "看数据 · 拿建议", subtitle: "已发布笔记的数据表现与改进建议。" },
  cover: { group: "制作工具", label: "封面与配图", subtitle: "为当前笔记生成封面与内容配图。" },
  video: { group: "制作工具", label: "视频方案", subtitle: "把笔记转成口播 / 分镜视频脚本。" },
  rewrite: { group: "制作工具", label: "更像爆款", subtitle: "对标道库改写，贴近爆款结构。" },
  blogger: { group: "制作工具", label: "对标拆解", subtitle: "拆解对标博主，沉淀可复用的道库。" },
  quality: { group: "制作工具", label: "质检发布", subtitle: "发布前规则质检与兜底修复。" },
};

// 侧栏两级导航，从 AREAS 派生：AREA_ORDER 是 Record 键的完整列表，
// 新增区 id 时类型层会强制补 AREAS，从而保证它一定有导航入口。
const AREA_ORDER: WorkbenchAreaId[] = ["workbench", "library", "review", "cover", "video", "rewrite", "blogger", "quality"];
const GROUP_ORDER: AreaGroup[] = ["内容流程", "制作工具"];
const NAV_GROUPS: WorkbenchNavGroup[] = GROUP_ORDER.map((title) => ({
  title,
  items: AREA_ORDER.filter((id) => AREAS[id].group === title).map((id) => ({
    id,
    label: AREAS[id].label,
    hint: AREAS[id].hint,
  })),
}));

// 制作工具页统一的滚动容器：居中定宽，与素材库 / 复盘保持一致
function ToolScroll({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl p-4 md:p-6">{children}</div>
    </div>
  );
}

// 工具页的「当前笔记」上下文条：工具页脱离了三栏，用它提示正在处理哪篇
function NoteContextBar({ note, onGoWorkbench }: { note: ContentCard | null; onGoWorkbench: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#E5E5EA] bg-white px-3 py-2 text-xs">
      <span className="shrink-0 font-semibold text-[#8B8983]">当前笔记</span>
      <span className="truncate font-bold text-[#1D1D1F]">
        {note ? note.titleCandidates[0] || note.coreViewpoint : "未选择"}
      </span>
      <button
        type="button"
        onClick={onGoWorkbench}
        className="ml-auto shrink-0 font-semibold text-[#FF2442] transition-colors hover:text-[#E01E3A]"
      >
        切换 →
      </button>
    </div>
  );
}

// 工具页无笔记时的空态：把用户引回工作台选一篇
function EmptyNote({ hint, onGoWorkbench }: { hint: string; onGoWorkbench: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#D2D2D7] bg-white py-16 text-center">
      <p className="text-sm text-[#6E6E73]">{hint}</p>
      <button
        type="button"
        onClick={onGoWorkbench}
        className="rounded-lg bg-[#1D1D1F] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black"
      >
        去工作台选笔记 →
      </button>
    </div>
  );
}

// 制作工具页统一骨架：滚动容器 + 页头（标题/副标题取自 AREAS）+ 可选「当前笔记」条 + 缺笔记空态。
// 封面/视频/改写/质检共用它，只各自传入自己的工具组件与就绪条件。
function ToolPage({
  area,
  note,
  ready = true,
  emptyHint,
  onGoWorkbench,
  children,
}: {
  area: WorkbenchAreaId;
  /** 传入则显示「当前笔记」上下文条；对标拆解这类与具体笔记无关的页不传。 */
  note?: ContentCard | null;
  /** false 时显示空态而非 children（缺笔记 / 缺草稿）。 */
  ready?: boolean;
  emptyHint?: string;
  onGoWorkbench: () => void;
  children: ReactNode;
}) {
  const meta = AREAS[area];
  return (
    <ToolScroll>
      <PageHeader
        title={meta.label}
        subtitle={meta.subtitle}
        meta={note !== undefined ? <NoteContextBar note={note} onGoWorkbench={onGoWorkbench} /> : undefined}
      />
      {ready ? children : <EmptyNote hint={emptyHint || ""} onGoWorkbench={onGoWorkbench} />}
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
  const [imageMode, setImageMode] = useState<"cover" | "content">("cover");
  const [contentImageTemplate, setContentImageTemplate] = useState<ContentImageTemplateType>("flowchart");
  const [contentImagePlan, setContentImagePlan] = useState<ContentImagePlan | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  // 顶层工作区：内容工作台 / 素材库 / 复盘
  const [area, setArea] = useState<WorkbenchAreaId>("library");
  const [bloggerDistillation, setBloggerDistillation] = useState<BloggerDistillation | null>(null);
  // 每条选题各自绑定的对标博主道库：topicId -> bloggerId（""=不绑定）
  const [topicDaokuMap, setTopicDaokuMap] = useState<Record<string, string>>({});
  const [videoPlan, setVideoPlan] = useState<VideoPlan | null>(null);
  const [videoRendered, setVideoRendered] = useState(false);
  const setNotice = useCallback((notice: Notice) => {
    if (notice.type === "success") {
      toast.success(notice.message);
    } else if (notice.type === "error") {
      toast.error(notice.message);
    } else {
      toast.info(notice.message);
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
  const [coverDataUrl, setCoverDataUrl] = useState("");
  const [contentImageDataUrl, setContentImageDataUrl] = useState("");
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  // 编辑弹窗：素材 / 选题
  const [editingMaterial, setEditingMaterial] = useState<MaterialItem | null>(null);
  const [editingTopic, setEditingTopic] = useState<ContentCard | null>(null);
  // 新增弹窗：素材（素材库工具条）/ 选题（新建笔记）
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [addingTopic, setAddingTopic] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("demo");
  const [bootstrapConfig, setBootstrapConfig] = useState<WorkflowBootstrapResult["config"] | null>(null);
  const hasPendingMaterials = snapshot.materials.some((item) => item.status === MATERIAL_STATUS.pending);
  const isFeishuReady = workflowMode === "connected" && Boolean(bootstrapConfig?.feishuReady);
  const localDocsSourceDir = bootstrapConfig?.localDocsSourceDir || "";
  const topicPoolDir = bootstrapConfig?.topicPoolDir || "";
  const usableTopics = useMemo(() => getUsableTopics(snapshot.topics), [snapshot.topics]);
  const usableDrafts = useMemo(() => getUsableDrafts(snapshot.drafts), [snapshot.drafts]);
  const publishedMetrics = useMemo(() => {
    const publishedNoteIds = new Set(usableDrafts.filter(isPublishedDraft).map((draft) => draft.noteId));
    return snapshot.metrics.filter((metric) => publishedNoteIds.has(metric.noteId));
  }, [snapshot.metrics, usableDrafts]);
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
    setArea("workbench");
    setCoverPlan(null);
    setCoverDataUrl("");
    setImageMode("cover");
    setContentImagePlan(null);
    setContentImageDataUrl("");
    setNotice({ type: "success", message: "已进入 Demo 模式，不会写入飞书" });
  }, [applySnapshot, setNotice]);

  const handleLoadMarkdownDemo = useCallback((markdown: string) => {
    const nextSnapshot = createMarkdownDemoSnapshot(markdown);
    setWorkflowMode("demo");
    applySnapshot(nextSnapshot, [nextSnapshot.materials[0]?.recordId || ""]);
    setArea("workbench");
    setCoverPlan(null);
    setCoverDataUrl("");
    setImageMode("content");
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
        const data = await loadFeishuSnapshot();
        // 已连飞书且已有素材的回头用户，直接落到素材步，不停在引导页
        if (isActive && data && data.materials.length > 0) {
          setArea("workbench");
        }
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

  const handleGenerateTopics = useCallback(async () => {
    if (!hasPendingMaterials) {
      setNotice({ type: "error", message: "没有待提炼素材。请先在「本地文档入库」点「写入飞书」，再同步飞书。" });
      return;
    }
    if (selectedMaterials.length === 0) {
      setNotice({ type: "error", message: "请先在素材页勾选本轮要提炼的素材。" });
      return;
    }

    setIsGeneratingTopics(true);
    setNotice({ type: "info", message: `正在从 ${selectedMaterials.length} 条已选素材提炼选题` });
    try {
      const shouldWriteBack = workflowMode === "connected";
      const result = await generateContentCards({
        count: selectedMaterials.length,
        status: MATERIAL_STATUS.pending,
        writeBack: shouldWriteBack,
        materials: selectedMaterials,
        glossary: snapshot.glossary,
      });
      setSnapshot((current) => ({
        ...current,
        topics: mergeByKey(current.topics, result.cards, (topic) => topic.topicId),
      }));
      setSelectedTopic(result.cards[0] || null);
      setSelectedDraft(null);
      setArea("workbench");
      setNotice({
        type: "success",
        message: shouldWriteBack ? "已基于已选素材生成选题，并写回飞书" : "已基于 Demo 素材生成选题",
      });
      if (shouldWriteBack) {
        await loadFeishuSnapshot();
      }
    } catch (error) {
      setFriendlyError("topics.generate", error);
    } finally {
      setIsGeneratingTopics(false);
    }
  }, [hasPendingMaterials, loadFeishuSnapshot, selectedMaterials, setFriendlyError, setNotice, snapshot.glossary, workflowMode]);

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
      setFriendlyError("drafts.generate", error);
    } finally {
      setIsGeneratingDrafts(false);
    }
  }, [loadFeishuSnapshot, selectedTopic, setFriendlyError, setNotice, usableTopics, workflowMode]);

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
      const result = shouldWriteBack && sourceDraft?.recordId
        ? await generateCover({
            sourceType: "draft",
            recordId: sourceDraft.recordId,
            writeBack: true,
          })
        : shouldWriteBack && sourceTopic?.recordId
          ? await generateCover({
              sourceType: "topic",
              recordId: sourceTopic.recordId,
              writeBack: true,
            })
          : await generateCover({
              input: sourceDraft ? draftToCoverInput(sourceDraft) : topicToCoverInput(sourceTopic as ContentCard),
              writeBack: false,
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
      setFriendlyError("covers.generate", error);
    } finally {
      setIsGeneratingCover(false);
    }
  }, [loadFeishuSnapshot, selectedDraft, selectedTopic, setFriendlyError, setNotice, workflowMode]);

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
      });
      setContentImagePlan(result.plan);
      setImageMode("content");
      setNotice({
        type: "success",
        message: result.usedFallback ? "已用规则生成内容配图" : "内容配图已生成",
      });
    } catch (error) {
      setFriendlyError("images.generateContent", error);
    } finally {
      setIsGeneratingContentImage(false);
    }
  }, [contentImageTemplate, selectedDraft, selectedTopic, setFriendlyError, setNotice]);

  const handleGenerateReview = useCallback(async () => {
    setIsReviewing(true);
    setNotice({ type: "info", message: "正在复盘已发布笔记数据" });
    try {
      const shouldWriteBack = workflowMode === "connected";
      const result = await generateReview({
        writeBack: shouldWriteBack,
        metrics: shouldWriteBack ? undefined : publishedMetrics,
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
      setFriendlyError("review.generate", error);
    } finally {
      setIsReviewing(false);
    }
  }, [loadFeishuSnapshot, publishedMetrics, setFriendlyError, setNotice, workflowMode]);

  const handleDownloadCover = useCallback(() => {
    if (!coverDataUrl) {
      setNotice({ type: "error", message: "请先在图片页生成封面预览图" });
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

  const boundDaokuName = DAOKU_OPTIONS.find(
    (option) => option.bloggerId === topicDaokuMap[selectedTopic?.topicId || ""]
  )?.name;
  const bloggerReady = Boolean(bloggerDistillation);
  const videoReady = Boolean(videoPlan);

  return (
    <>
      <WorkbenchShell
        groups={NAV_GROUPS}
        area={area}
        onAreaChange={setArea}
        workflowMode={workflowMode}
        aiProvider={bootstrapConfig?.aiProvider ?? null}
        syncing={isSyncing}
        syncLabel={workflowMode === "demo" ? "重载 Demo" : "同步飞书"}
        onSync={loadSnapshot}
      >
        {area === "workbench" && (
          <div className="flex h-full flex-col">
            <div className="shrink-0 border-b border-[#E5E5EA] bg-white px-4 py-2.5 md:px-6">
              <PageHeader
                variant="bar"
                title={AREAS.workbench.label}
                subtitle={
                  selectedTopic
                    ? selectedTopic.titleCandidates[0] || selectedTopic.coreViewpoint
                    : AREAS.workbench.subtitle
                }
                action={
                  <button
                    type="button"
                    onClick={() => setAddingTopic(true)}
                    className="rounded-lg bg-[#1D1D1F] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-black"
                  >
                    + 新建笔记
                  </button>
                }
              />
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="hidden w-72 shrink-0 border-r border-[#E5E5EA] md:block">
                <NoteList
                  notes={usableTopics}
                  drafts={usableDrafts}
                  selectedTopicId={selectedTopic?.topicId ?? null}
                  onSelect={handleSelectNote}
                  onNew={() => setAddingTopic(true)}
                  onGenerateFromMaterials={() => setArea("library")}
                />
              </div>
              <div className="min-w-0 flex-1">
                <NoteEditor
                  selectedTopic={selectedTopic}
                  selectedDraft={selectedDraft}
                  boundDaokuName={boundDaokuName}
                  isGenerating={isGeneratingDrafts}
                  isSaving={isSavingDraft}
                  onGenerateDraft={handleGenerateDraft}
                  onSaveDraft={handleSaveDraft}
                  onOpenRewrite={() => setArea("rewrite")}
                />
              </div>
              <div className="hidden w-80 shrink-0 border-l border-[#E5E5EA] lg:block">
                <NoteInspector
                  topic={selectedTopic}
                  draft={selectedDraft}
                  onEditTopic={() => selectedTopic && handleEditTopic(selectedTopic)}
                  onDeleteTopic={() => selectedTopic && handleDeleteTopic(selectedTopic)}
                  sourceSummary={selectedTopic?.sourceMaterial || ""}
                  onOpenLibrary={() => setArea("library")}
                  daokuOptions={DAOKU_OPTIONS}
                  topicDaokuMap={topicDaokuMap}
                  onBindDaoku={handleBindDaoku}
                  bloggerReady={bloggerReady}
                  onOpenBlogger={() => setArea("blogger")}
                  coverDataUrl={coverDataUrl}
                  onOpenCover={() => setArea("cover")}
                  videoReady={videoReady}
                  onOpenVideo={() => setArea("video")}
                  quality={qualityResult}
                  onOpenQuality={() => setArea("quality")}
                  onPublish={() => {
                    if (selectedDraft) handlePublishDraft(selectedDraft);
                  }}
                  publishing={isPublishingDraft}
                />
              </div>
            </div>
          </div>
        )}

        {area === "library" && (
          <ToolScroll>
            <PageHeader
              title={AREAS.library.label}
              subtitle={AREAS.library.subtitle}
              action={
                <button
                  type="button"
                  onClick={handleGenerateTopics}
                  disabled={isGeneratingTopics || selectedMaterials.length === 0}
                  className="rounded-lg bg-[#FF2442] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E01E3A] disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6]"
                >
                  {isGeneratingTopics ? "生成中…" : `生成选题（${selectedMaterials.length}）`}
                </button>
              }
            />
            <div className="space-y-3">
              <WorkflowOnboarding
                mode={workflowMode}
                config={bootstrapConfig}
                onUseDemo={handleUseDemo}
                onLoadMarkdown={handleLoadMarkdownDemo}
                onConnectFeishu={handleConnectFeishu}
                onOpenSource={() => setArea("workbench")}
                onDismiss={() => setArea("workbench")}
              />
              <details className="group rounded-lg border border-[#E5E5EA] bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#1D1D1F]">录入与提炼</h3>
                    <p className="mt-0.5 text-xs text-[#8B8983]">线索采集、选题池导入——展开按需使用</p>
                  </div>
                  <span className="text-xs font-semibold text-[#8B8983] transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div className="space-y-3 border-t border-[#E5E5EA] p-4">
                  <p className="text-sm text-[#6E6E73]">
                    勾选下方素材，点右上「生成选题」即可提炼——每条选题就是一篇新笔记。已选{" "}
                    <span className="font-bold tabular-nums text-[#1D1D1F]">{selectedMaterials.length}</span> 条。
                  </p>
                  <ClueIntakePanel onClues={handleAddClues} onNotice={setNotice} />
                  <TopicPoolImportPanel
                    defaultSourceDir={topicPoolDir}
                    isFeishuReady={isFeishuReady}
                    onNotice={setNotice}
                    onImported={loadSnapshot}
                  />
                </div>
              </details>
              <SourceWorkspace
                materials={snapshot.materials}
                selectedMaterialIds={selectedMaterialIds}
                localDocsSourceDir={localDocsSourceDir}
                isFeishuReady={isFeishuReady}
                onToggleMaterial={handleToggleMaterial}
                onSelectPendingMaterials={handleSelectPendingMaterials}
                onClearSelectedMaterials={handleClearSelectedMaterials}
                onAdd={() => setAddingMaterial(true)}
                onEditMaterial={handleEditMaterial}
                onDeleteMaterial={handleDeleteMaterial}
                onBatchDeleteMaterials={handleBatchDeleteMaterials}
                onNotice={setNotice}
                onImported={loadSnapshot}
              />
            </div>
          </ToolScroll>
        )}

        {area === "review" && (
          <ToolScroll>
            <PageHeader title={AREAS.review.label} subtitle={AREAS.review.subtitle} />
            <ReviewDashboard
              metrics={publishedMetrics}
              review={review}
              onGenerate={handleGenerateReview}
              generating={isReviewing}
            />
          </ToolScroll>
        )}

        {area === "cover" && (
          <ToolPage area="cover" note={selectedTopic} onGoWorkbench={() => setArea("workbench")}>
            <div className="space-y-3">
              <CoverStudio
                topics={usableTopics}
                drafts={usableDrafts}
                selectedTopic={selectedTopic}
                selectedDraft={selectedDraft}
                coverConfig={coverConfig}
                coverPlan={coverPlan}
                imageMode={imageMode}
                contentImageTemplate={contentImageTemplate}
                contentImagePlan={contentImagePlan}
                contentImageDataUrl={contentImageDataUrl}
                isGenerating={isGeneratingCover}
                isGeneratingContentImage={isGeneratingContentImage}
                onGenerateCover={handleGenerateCover}
                onGenerateContentImage={handleGenerateContentImage}
                onSelectTopic={handleSelectTopic}
                onSelectDraft={handleSelectDraft}
                onConfigChange={setCoverConfig}
                onCoverGenerated={setCoverDataUrl}
                onImageModeChange={setImageMode}
                onContentTemplateChange={handleContentTemplateChange}
                onContentImageGenerated={setContentImageDataUrl}
              />
              {(coverDataUrl || contentImageDataUrl) && (
                <div className="flex flex-wrap gap-2">
                  {coverDataUrl && (
                    <button
                      type="button"
                      onClick={handleDownloadCover}
                      className="rounded-lg border border-[#D2D2D7] bg-white px-4 py-2 text-sm font-semibold text-[#1D1D1F] hover:bg-[#F5F5F7]"
                    >
                      下载封面
                    </button>
                  )}
                  {contentImageDataUrl && (
                    <button
                      type="button"
                      onClick={handleDownloadContentImage}
                      className="rounded-lg border border-[#D2D2D7] bg-white px-4 py-2 text-sm font-semibold text-[#1D1D1F] hover:bg-[#F5F5F7]"
                    >
                      下载配图
                    </button>
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
            emptyHint="做视频前，先在工作台选一篇笔记。"
            onGoWorkbench={() => setArea("workbench")}
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
            emptyHint="改写前，先在工作台选一篇笔记。"
            onGoWorkbench={() => setArea("workbench")}
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
          <ToolPage area="blogger" onGoWorkbench={() => setArea("workbench")}>
            <BloggerResearch
              selectedDistillation={bloggerDistillation}
              onDistillationChange={setBloggerDistillation}
            />
          </ToolPage>
        )}

        {area === "quality" && (
          <ToolPage
            area="quality"
            note={selectedTopic}
            ready={Boolean(selectedDraft)}
            emptyHint="质检需要一篇草稿，先在工作台生成草稿。"
            onGoWorkbench={() => setArea("workbench")}
          >
            <QualityGate
              result={qualityResult}
              draft={selectedDraft}
              onApplyDraftPatch={handlePatchDraft}
              onResolve={(action) => {
                if (action === "rewrite") setArea("rewrite");
                else if (action === "cover") setArea("cover");
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
        title="新建笔记（选题）"
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
