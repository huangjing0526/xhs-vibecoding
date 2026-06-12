"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import TopicPipeline from "@/components/workflow/TopicPipeline";
import DraftPipeline from "@/components/workflow/DraftPipeline";
import CoverStudio from "@/components/workflow/CoverStudio";
import LocalDocsSyncPanel from "@/components/workflow/LocalDocsSyncPanel";
import ReviewDashboard from "@/components/workflow/ReviewDashboard";
import WorkflowOnboarding from "@/components/workflow/WorkflowOnboarding";
import AppShell from "@/components/workflow/AppShell";
import BloggerResearch from "@/components/workflow/BloggerResearch";
import ModuleHeader from "@/components/workflow/ModuleHeader";
import PipelineOverview from "@/components/workflow/PipelineOverview";
import RewriteStudio from "@/components/workflow/RewriteStudio";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import VideoStudio from "@/components/workflow/VideoStudio";
import { getWorkflowModuleMeta, type WorkflowModule } from "@/components/workflow/workflowModules";
import type { BloggerDistillation } from "@/lib/bloggerWorkflow";
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
  hasContentCardContent,
  hasDraftContent,
  hasGeneratedCover,
  isPublishedDraft,
  type ContentCard,
  type DraftNote,
  type MaterialItem,
  type ReviewResult,
} from "@/lib/xhsWorkflow";
import {
  generateContentCards,
  generateCover,
  generateDrafts,
  generateImageAsset,
  generateReview,
  getWorkflowBootstrap,
  publishDraft,
  saveDraft,
  syncWorkflowData,
  type WorkflowBootstrapResult,
  type WorkflowMode,
  type WorkflowSnapshot,
} from "@/lib/workflowClient";
import type { VideoPlan } from "@/lib/videoWorkflow";

const EMPTY_SNAPSHOT: WorkflowSnapshot = {
  materials: [],
  glossary: [],
  topics: [],
  drafts: [],
  metrics: [],
};

type NoticeType = "success" | "error" | "info";

interface Notice {
  type: NoticeType;
  message: string;
}

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

function isSameDraft(left: DraftNote, right: DraftNote): boolean {
  return Boolean(
    (left.noteId && left.noteId === right.noteId) ||
      (left.recordId && right.recordId && left.recordId === right.recordId)
  );
}

function isSameTopic(left: ContentCard, right: ContentCard): boolean {
  return Boolean(
    (left.topicId && left.topicId === right.topicId) ||
      (left.recordId && right.recordId && left.recordId === right.recordId)
  );
}

function mergeByKey<T>(current: T[], incoming: T[], getKey: (item: T) => string): T[] {
  const next = new Map(current.map((item) => [getKey(item), item]));
  incoming.forEach((item) => next.set(getKey(item), item));
  return Array.from(next.values());
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const map = new Map<string, T>();
  items.forEach((item) => {
    const key = getKey(item);
    if (key) map.set(key, item);
  });
  return Array.from(map.values());
}

function normalizeMergeText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function getTopicMergeKey(topic: ContentCard): string {
  const title = topic.titleCandidates[0] || topic.coreViewpoint;
  return [
    normalizeMergeText(title),
    normalizeMergeText(topic.painPoint),
    normalizeMergeText(topic.targetReader),
  ].join("|");
}

function splitMultiValue(text: string): string[] {
  return text
    .split(/\n|\/|、|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function joinMergedText(values: string[]): string {
  return uniqueValues(values).join("\n");
}

function joinMergedTerms(values: string[]): string {
  return uniqueValues(values.flatMap(splitMultiValue)).join(" / ");
}

function mergeTopicGroup(topics: ContentCard[]): ContentCard {
  const [primary] = topics;
  const titleCandidates = uniqueValues(topics.flatMap((topic) => topic.titleCandidates));
  const sourceMaterials = topics.map((topic) => topic.sourceMaterial);
  const realCases = topics.map((topic) => topic.realCase);
  const reusableAssets = topics.map((topic) => topic.reusableAsset);
  const outlines = uniqueValues(topics.flatMap((topic) => topic.outline));

  return {
    ...primary,
    recordId: topics.length === 1 ? primary.recordId : undefined,
    sourceMaterial: joinMergedText(sourceMaterials),
    relatedTerm: joinMergedTerms(topics.map((topic) => topic.relatedTerm)),
    realCase: joinMergedText(realCases),
    reusableAsset: joinMergedText(reusableAssets),
    titleCandidates,
    coverText: primary.coverText || topics.find((topic) => topic.coverText)?.coverText || "",
    outline: outlines.length > 0 ? outlines : primary.outline,
    commentPrompt: primary.commentPrompt || topics.find((topic) => topic.commentPrompt)?.commentPrompt || "",
    estimatedSaveValue: Math.max(...topics.map((topic) => topic.estimatedSaveValue || 0), primary.estimatedSaveValue || 3),
    status: topics.some((topic) => topic.status === "待写") ? "待写" : primary.status,
  };
}

function hasSharedTopicSource(topics: ContentCard[], topic: ContentCard): boolean {
  const currentSources = splitMultiValue(topic.sourceMaterial);
  if (currentSources.length === 0) return false;

  const existingSources = new Set(topics.flatMap((item) => splitMultiValue(item.sourceMaterial)));
  return currentSources.some((source) => existingSources.has(source));
}

function hasSharedRealCase(topics: ContentCard[], topic: ContentCard): boolean {
  const currentCase = normalizeMergeText(topic.realCase);
  return Boolean(currentCase && topics.some((item) => normalizeMergeText(item.realCase) === currentCase));
}

function canMergeTopicIntoGroup(topics: ContentCard[], topic: ContentCard): boolean {
  const [primary] = topics;
  if (!primary || getTopicMergeKey(primary) !== getTopicMergeKey(topic)) return false;

  return hasSharedTopicSource(topics, topic) || hasSharedRealCase(topics, topic);
}

function mergeRelatedTopics(topics: ContentCard[]): ContentCard[] {
  const groups: ContentCard[][] = [];

  topics.forEach((topic) => {
    const existingGroup = groups.find((group) => canMergeTopicIntoGroup(group, topic));
    if (existingGroup) existingGroup.push(topic);
    else groups.push([topic]);
  });

  return groups.map(mergeTopicGroup);
}

function getUsableTopics(topics: ContentCard[]): ContentCard[] {
  const uniqueTopics = dedupeByKey(topics.filter(hasContentCardContent), (topic) => topic.topicId || topic.recordId || "");
  return mergeRelatedTopics(uniqueTopics);
}

function getUsableDrafts(drafts: DraftNote[]): DraftNote[] {
  return dedupeByKey(drafts.filter(hasDraftContent), (draft) => draft.noteId || draft.recordId || "");
}

function clip(text: string | undefined, maxLength = 92): string {
  if (!text) return "未填写";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

interface SourceWorkspaceProps {
  materials: WorkflowSnapshot["materials"];
  selectedMaterialIds: string[];
  localDocsSourceDir: string;
  isFeishuReady: boolean;
  onToggleMaterial: (materialId: string) => void;
  onSelectPendingMaterials: () => void;
  onClearSelectedMaterials: () => void;
  onNotice: (notice: Notice) => void;
  onImported: () => Promise<void>;
}

type MaterialViewFilter = "all" | "pending" | "processed";
type ProductionGoal = "imageText" | "video" | "rewrite";

function SourceWorkspace({
  materials,
  selectedMaterialIds,
  localDocsSourceDir,
  isFeishuReady,
  onToggleMaterial,
  onSelectPendingMaterials,
  onClearSelectedMaterials,
  onNotice,
  onImported,
}: SourceWorkspaceProps) {
  const [materialFilter, setMaterialFilter] = useState<MaterialViewFilter>("all");
  const [productionGoal, setProductionGoal] = useState<ProductionGoal>("imageText");
  const pendingMaterials = materials.filter((item) => item.status === "待提炼");
  const processedMaterials = materials.filter((item) => item.status !== "待提炼");
  const visibleMaterials =
    materialFilter === "pending"
      ? pendingMaterials
      : materialFilter === "processed"
        ? processedMaterials
        : materials;
  const selectedCount = selectedMaterialIds.length;

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-[#E5E5EA] bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#1D1D1F]">本轮目标</h3>
            <p className="mt-1 text-sm text-[#6E6E73]">先确定本轮素材用于图文、视频还是改写。</p>
          </div>
          <SegmentedControl
            value={productionGoal}
            onChange={setProductionGoal}
            ariaLabel="本轮目标"
            options={[
              { value: "imageText", label: "图文", description: "选题、草稿、图片" },
              { value: "video", label: "视频", description: "脚本、分镜、Prompt" },
              { value: "rewrite", label: "改写", description: "标题、正文、结构" },
            ]}
          />
        </div>
      </section>

      <LocalDocsSyncPanel
        defaultSourceDir={localDocsSourceDir}
        isFeishuReady={isFeishuReady}
        onNotice={onNotice}
        onImported={onImported}
      />

      <section className="rounded-lg border border-[#E5E5EA] bg-white">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          {[
            { id: "all", label: "全部", value: materials.length },
            { id: "pending", label: "待提炼", value: pendingMaterials.length },
            { id: "processed", label: "已处理", value: processedMaterials.length },
          ].map((item) => {
            const isActive = materialFilter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setMaterialFilter(item.id as MaterialViewFilter)}
                className={`px-3 py-1.5 text-sm font-black transition-colors ${
                  isActive
                    ? "bg-stone-950 text-white"
                    : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                }`}
              >
                {item.label}
                <span className={`ml-1.5 text-xs font-bold tabular-nums ${isActive ? "text-stone-400" : "text-stone-400"}`}>
                  {item.value}
                </span>
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-stone-400">
              已选 <span className="font-black text-stone-700 tabular-nums">{selectedCount}</span>
            </span>
            <button
              type="button"
              onClick={onSelectPendingMaterials}
              disabled={pendingMaterials.length === 0}
              className="border border-stone-300 bg-white px-3 py-1.5 text-sm font-black text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-300"
            >
              选前 6 条
            </button>
            <button
              type="button"
              onClick={onClearSelectedMaterials}
              disabled={selectedCount === 0}
              className="border border-stone-300 bg-white px-3 py-1.5 text-sm font-black text-stone-600 transition-colors hover:border-rose-600 hover:text-rose-600 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-300"
            >
              清空
            </button>
          </div>
        </div>

        <div className="hidden grid-cols-[42px_140px_minmax(220px,1fr)_minmax(220px,0.92fr)] border-y border-stone-200 bg-stone-50 px-4 py-2 text-xs font-black uppercase tracking-wider text-stone-400 xl:grid 2xl:grid-cols-[42px_160px_minmax(260px,1fr)_minmax(250px,0.92fr)]">
          <div>选</div>
          <div>来源</div>
          <div>核心事件</div>
          <div>可复用方法</div>
        </div>

        <div className="max-h-[calc(100vh-280px)] min-h-[420px] overflow-auto">
          {(() => {
            const activeItems = visibleMaterials.filter((item) => !(item as MaterialItem & { archived?: boolean }).archived);
            const archivedItems = visibleMaterials.filter((item) => (item as MaterialItem & { archived?: boolean }).archived);
            const renderRow = (item: MaterialItem, archived = false) => {
              const isSelected = selectedMaterialIds.includes(item.recordId);
              return (
                <button
                  key={item.recordId}
                  type="button"
                  onClick={() => !archived && onToggleMaterial(item.recordId)}
                  disabled={archived}
                  className={`grid w-full gap-3 border-b border-stone-100 px-4 py-3 text-left transition-colors xl:grid-cols-[42px_140px_minmax(220px,1fr)_minmax(220px,0.92fr)] 2xl:grid-cols-[42px_160px_minmax(260px,1fr)_minmax(250px,0.92fr)] ${
                    archived ? "bg-stone-50 opacity-60" : isSelected ? "bg-rose-50" : "bg-white hover:bg-stone-50"
                  }`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 items-center justify-center text-xs font-black ${
                    isSelected ? "bg-rose-600 text-white" : "bg-stone-100 text-transparent"
                  }`}>
                    ✓
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-stone-400">{item.sourceId}</div>
                    <div className="mt-1.5 inline-flex bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
                      {item.status || "素材"}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="xl:hidden text-xs font-bold text-stone-400">核心事件</div>
                    <div className="text-sm font-black leading-6 text-stone-950">{clip(item.event || item.summary, 82)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="xl:hidden text-xs font-bold text-stone-400">可复用方法</div>
                    <div className="text-sm font-semibold leading-6 text-stone-600">{clip(item.method || item.pitfall, 92)}</div>
                  </div>
                </button>
              );
            };
            return (
              <>
                {activeItems.map((item) => renderRow(item, false))}
                {archivedItems.length > 0 && (
                  <details className="group">
                    <summary className="flex cursor-pointer items-center gap-2 border-y border-stone-200 bg-stone-100 px-4 py-2 text-xs font-black text-stone-500 hover:bg-stone-200">
                      <span className="transition-transform group-open:rotate-90">▸</span>
                      <span>已归档 <span className="tabular-nums">{archivedItems.length}</span> 条</span>
                    </summary>
                    {archivedItems.map((item) => renderRow(item, true))}
                  </details>
                )}
                {visibleMaterials.length === 0 && (
                  <div className="p-10 text-center text-sm text-stone-500">当前筛选下暂无素材</div>
                )}
              </>
            );
          })()}
        </div>
      </section>
    </div>
  );
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
  const [activeModule, setActiveModule] = useState<WorkflowModule>("overview");
  const [bloggerDistillation, setBloggerDistillation] = useState<BloggerDistillation | null>(null);
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
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("demo");
  const [bootstrapConfig, setBootstrapConfig] = useState<WorkflowBootstrapResult["config"] | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const hasPendingMaterials = snapshot.materials.some((item) => item.status === "待提炼");
  const isFeishuReady = workflowMode === "connected" && Boolean(bootstrapConfig?.feishuReady);
  const localDocsSourceDir = bootstrapConfig?.localDocsSourceDir || "";
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

  const loadFeishuSnapshot = useCallback(async () => {
    setIsSyncing(true);
    try {
      const data = await syncWorkflowData();
      applySnapshot(data);
      setWorkflowMode("connected");
      setNotice({ type: "success", message: "飞书数据已同步" });
    } catch (error) {
      setFriendlyError("workflow.sync", error);
    } finally {
      setIsSyncing(false);
    }
  }, [applySnapshot, setFriendlyError, setNotice]);

  const handleUseDemo = useCallback(() => {
    setWorkflowMode("demo");
    applySnapshot(DEMO_SNAPSHOT, DEMO_SELECTED_MATERIAL_IDS);
    setActiveModule("assets");
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
    setActiveModule("images");
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
        .filter((item) => item.status === "待提炼")
        .slice(0, 6)
        .map((item) => item.recordId)
    );
  }, [snapshot.materials]);

  const handleClearSelectedMaterials = useCallback(() => {
    setSelectedMaterialIds([]);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function bootstrapWorkflow() {
      setIsSyncing(true);
      setNotice({ type: "info", message: "正在准备工作台" });
      try {
        const bootstrap = await getWorkflowBootstrap();
        if (!isActive) return;

        setBootstrapConfig(bootstrap.config);
        const shouldShowGuide =
          typeof window !== "undefined" && !window.localStorage.getItem("xhs_workflow_onboarding_closed");
        setShowOnboarding(shouldShowGuide || bootstrap.mode === "demo");

        if (bootstrap.mode === "demo") {
          setWorkflowMode("demo");
          applySnapshot(bootstrap.snapshot || DEMO_SNAPSHOT, DEMO_SELECTED_MATERIAL_IDS);
          setNotice({ type: "success", message: "已加载 Demo 数据，可直接体验完整闭环" });
          return;
        }

        setWorkflowMode("connected");
        await loadFeishuSnapshot();
      } catch (error) {
        if (!isActive) return;
        console.error("[WorkflowDashboard] 启动失败，切换 Demo", { action: "workflow.bootstrap", error });
        setWorkflowMode("demo");
        applySnapshot(DEMO_SNAPSHOT, DEMO_SELECTED_MATERIAL_IDS);
        setShowOnboarding(true);
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

  const handleDismissOnboarding = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("xhs_workflow_onboarding_closed", "1");
    }
    setShowOnboarding(false);
  }, []);

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
        status: "待提炼",
        writeBack: shouldWriteBack,
        materials: selectedMaterials,
        glossary: snapshot.glossary,
      });
      setSnapshot((current) => ({
        ...current,
        topics: mergeByKey(current.topics, result.cards, (topic) => topic.topicId),
      }));
      setSelectedTopic(result.cards[0] || null);
      setActiveModule("topics");
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
      const fallbackCard = usableTopics.find((topic) => topic.status === "待写") || usableTopics[0];
      const result = await generateDrafts({
        count: 1,
        status: "待写",
        writeBack: shouldWriteBack,
        cards: selectedTopic ? [selectedTopic] : fallbackCard ? [fallbackCard] : undefined,
      });
      setSnapshot((current) => ({
        ...current,
        drafts: mergeByKey(current.drafts, result.drafts, (draft) => draft.noteId),
      }));
      setSelectedDraft(result.drafts[0] || null);
      setActiveModule("rewrite");
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
      setActiveModule("review");
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
      setActiveModule("images");
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
      setActiveModule("images");
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
      setActiveModule("review");
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

  const primaryLabel =
    activeModule === "bloggers"
      ? "选择素材"
      : activeModule === "assets"
        ? "生成选题"
        : activeModule === "topics"
          ? "生成草稿"
          : activeModule === "rewrite"
            ? "生成图片"
            : activeModule === "images"
              ? imageMode === "content"
                ? contentImageDataUrl
                  ? "下载内容图"
                  : "生成内容图"
                : coverDataUrl
                  ? "下载封面"
                  : "生成封面方案"
              : activeModule === "video"
                ? videoPlan
                  ? selectedDraft
                    ? "标记发布"
                    : "先生成草稿"
                  : "先生成视频方案"
                : "生成复盘";

  const primaryDisabled =
    activeModule === "bloggers"
      ? false
      : activeModule === "assets"
        ? isGeneratingTopics || selectedMaterials.length === 0
        : activeModule === "topics"
          ? isGeneratingDrafts || !selectedTopic
          : activeModule === "rewrite"
            ? !selectedDraft && !selectedTopic
            : activeModule === "images"
              ? imageMode === "content"
                ? isGeneratingContentImage || (!contentImageDataUrl && !selectedDraft && !selectedTopic)
                : isGeneratingCover || (!coverDataUrl && !selectedDraft && !selectedTopic)
              : activeModule === "video"
                ? !videoPlan || !selectedDraft
                : isReviewing || publishedMetrics.length === 0;

  const handlePrimaryAction = useCallback(() => {
    if (activeModule === "bloggers") {
      setActiveModule("assets");
      return;
    }
    if (activeModule === "assets") {
      handleGenerateTopics();
      return;
    }
    if (activeModule === "topics") {
      handleGenerateDraft();
      return;
    }
    if (activeModule === "rewrite") {
      setActiveModule("images");
      return;
    }
    if (activeModule === "images") {
      if (imageMode === "content") {
        if (contentImageDataUrl) {
          handleDownloadContentImage();
        } else {
          handleGenerateContentImage();
        }
      } else {
        if (coverDataUrl) {
          handleDownloadCover();
        } else {
          handleGenerateCover();
        }
      }
      return;
    }
    if (activeModule === "video") {
      if (videoPlan && selectedDraft) {
        handlePublishDraft(selectedDraft);
      } else {
        setNotice({ type: "info", message: "请先在视频页生成视频方案。" });
      }
      return;
    }
    handleGenerateReview();
  }, [
    activeModule,
    contentImageDataUrl,
    coverDataUrl,
    handleDownloadContentImage,
    handleDownloadCover,
    handleGenerateCover,
    handleGenerateContentImage,
    handleGenerateDraft,
    handleGenerateReview,
    handleGenerateTopics,
    handlePublishDraft,
    imageMode,
    selectedDraft,
    setNotice,
    videoPlan,
  ]);

  const handleApplyRewriteToDraft = useCallback((draft: DraftNote) => {
    setSnapshot((current) => ({
      ...current,
      drafts: mergeByKey(current.drafts, [draft], (item) => item.noteId),
    }));
    setSelectedDraft(draft);
    setNotice({ type: "success", message: "改写结果已应用到当前草稿" });
  }, [setNotice]);

  const activePanel = useMemo(() => {
    if (activeModule === "bloggers") {
      return (
        <BloggerResearch
          selectedDistillation={bloggerDistillation}
          onDistillationChange={setBloggerDistillation}
        />
      );
    }

    if (activeModule === "assets") {
      return (
        <SourceWorkspace
          materials={snapshot.materials}
          selectedMaterialIds={selectedMaterialIds}
          localDocsSourceDir={localDocsSourceDir}
          isFeishuReady={isFeishuReady}
          onToggleMaterial={handleToggleMaterial}
          onSelectPendingMaterials={handleSelectPendingMaterials}
          onClearSelectedMaterials={handleClearSelectedMaterials}
          onNotice={setNotice}
          onImported={loadSnapshot}
        />
      );
    }

    if (activeModule === "topics") {
      return (
        <TopicPipeline
          topics={usableTopics}
          selectedTopic={selectedTopic}
          selectedMaterials={selectedMaterials}
          onSelectTopic={handleSelectTopic}
        />
      );
    }

    if (activeModule === "rewrite") {
      return (
        <div className="space-y-4">
          <RewriteStudio
            selectedTopic={selectedTopic}
            selectedDraft={selectedDraft}
            bloggerDistillation={bloggerDistillation}
            onApplyToDraft={handleApplyRewriteToDraft}
          />
          <DraftPipeline
            topics={usableTopics}
            drafts={usableDrafts}
            selectedTopic={selectedTopic}
            selectedDraft={selectedDraft}
            isGenerating={isGeneratingDrafts}
            isSaving={isSavingDraft}
            isPublishing={isPublishingDraft}
            onGenerateDraft={handleGenerateDraft}
            onSelectTopic={handleSelectTopic}
            onSelectDraft={handleSelectDraft}
            onSaveDraft={handleSaveDraft}
            onPublishDraft={handlePublishDraft}
            onOpenCover={() => setActiveModule("images")}
          />
        </div>
      );
    }

    if (activeModule === "images") {
      return (
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
      );
    }

    if (activeModule === "video") {
      return (
        <VideoStudio
          selectedTopic={selectedTopic}
          selectedDraft={selectedDraft}
          bloggerDistillation={bloggerDistillation}
          onVideoPlanChange={setVideoPlan}
          imageUrls={[coverDataUrl, contentImageDataUrl].filter(Boolean)}
          onRenderedChange={setVideoRendered}
        />
      );
    }

    return (
      <ReviewDashboard
        metrics={publishedMetrics}
        review={review}
      />
    );
  }, [
    activeModule,
    bloggerDistillation,
    contentImageDataUrl,
    contentImagePlan,
    contentImageTemplate,
    coverConfig,
    coverDataUrl,
    coverPlan,
    handleApplyRewriteToDraft,
    handleContentTemplateChange,
    handleGenerateCover,
    handleGenerateContentImage,
    handleGenerateDraft,
    handlePublishDraft,
    handleSaveDraft,
    handleSelectDraft,
    handleSelectTopic,
    handleToggleMaterial,
    handleSelectPendingMaterials,
    handleClearSelectedMaterials,
    isFeishuReady,
    localDocsSourceDir,
    loadSnapshot,
    imageMode,
    isGeneratingCover,
    isGeneratingContentImage,
    isGeneratingDrafts,
    isPublishingDraft,
    isSavingDraft,
    publishedMetrics,
    review,
    selectedDraft,
    selectedMaterialIds,
    selectedMaterials,
    selectedTopic,
    setNotice,
    snapshot,
    usableDrafts,
    usableTopics,
  ]);

  const imageAssetCount = [...usableTopics, ...usableDrafts].filter(hasGeneratedCover).length + (contentImageDataUrl ? 1 : 0);
  const moduleCounts: Partial<Record<WorkflowModule, number>> = {
    bloggers: bloggerDistillation ? 1 : 0,
    assets: snapshot.materials.length,
    topics: usableTopics.length,
    rewrite: usableDrafts.length,
    images: imageAssetCount,
    video: videoPlan ? 1 : 0,
    review: publishedMetrics.length,
  };
  const moduleCountLabels: Partial<Record<WorkflowModule, string>> = {
    bloggers: "个道库",
    assets: "条素材",
    topics: "条选题",
    rewrite: "条草稿",
    images: "张图片",
    video: "个方案",
    review: "条已发布",
  };
  const moduleMeta = getWorkflowModuleMeta(activeModule);

  return (
    <AppShell
      activeModule={activeModule}
      moduleCounts={moduleCounts}
      workflowMode={workflowMode}
      syncing={isSyncing}
      syncLabel={workflowMode === "demo" ? "重载 Demo" : "同步飞书"}
      onSync={loadSnapshot}
      onModuleChange={setActiveModule}
      onboarding={showOnboarding ? (
        <WorkflowOnboarding
          mode={workflowMode}
          config={bootstrapConfig}
          onUseDemo={handleUseDemo}
          onLoadMarkdown={handleLoadMarkdownDemo}
          onConnectFeishu={handleConnectFeishu}
          onOpenSource={() => setActiveModule("assets")}
          onDismiss={handleDismissOnboarding}
        />
      ) : null}
      context={{
        bloggerDistillation,
        selectedMaterialsCount: selectedMaterials.length,
        selectedTopic,
        selectedDraft,
        coverReady: Boolean(coverDataUrl),
        contentImageReady: Boolean(contentImageDataUrl),
        videoReady: Boolean(videoPlan),
        reviewSummary: review?.summary,
        primaryLabel,
        primaryDisabled,
        onPrimaryAction: handlePrimaryAction,
      }}
    >
      {activeModule === "overview" ? (
        <PipelineOverview
          counts={moduleCounts}
          countLabels={moduleCountLabels}
          workflowMode={workflowMode}
          onOpenModule={setActiveModule}
          selectedTopicTitle={selectedTopic?.titleCandidates?.[0] ?? selectedTopic?.coreViewpoint ?? null}
          selectedDraftTitle={selectedDraft?.title ?? null}
          videoRendered={videoRendered}
        />
      ) : (
        <>
          <ModuleHeader
            title={moduleMeta.label}
            description={moduleMeta.description}
            count={moduleCounts[activeModule]}
            countLabel={moduleCountLabels[activeModule]}
            primary={{
              label: primaryLabel,
              disabled: primaryDisabled,
              onClick: handlePrimaryAction,
            }}
          />

          {activePanel}

          {coverDataUrl && (
            <div className="rounded-lg border border-[#BFE7DC] bg-[#F0FBF8] px-4 py-3 text-sm font-semibold text-[#0A7F64]">
              封面图已生成，可在图片生成区下载，也可以用顶部主按钮直接下载。
            </div>
          )}

          {contentImageDataUrl && (
            <div className="rounded-lg border border-[#C7D7FE] bg-[#F4F7FF] px-4 py-3 text-sm font-semibold text-[#2563EB]">
              内容配图已生成，可在图片生成区下载，也可以用顶部主按钮直接下载。
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
