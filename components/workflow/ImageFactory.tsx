"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  BookmarkPlus,
  Check,
  Download,
  ImagePlus,
  Layers,
  Loader2,
  Maximize2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Type,
  UserRound,
  X,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import DirectoryField from "@/components/workflow/DirectoryField";
import ImageEngineCard from "@/components/workflow/ImageEngineCard";
import ImageTemplateList from "@/components/workflow/ImageTemplateList";
import TemplateSpecCard from "@/components/workflow/TemplateSpecCard";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import TemplateThumb from "@/components/workflow/TemplateThumb";
import ModelLibraryBoard from "@/components/workflow/ModelLibraryBoard";
import ModelLibraryPicker, { type ModelPick } from "@/components/workflow/ModelLibraryPicker";
import ModelTemplateStrip from "@/components/workflow/ModelTemplateStrip";
import TemplateEditor, { PreviewLightbox } from "@/components/workflow/ImageTemplateEditor";
import { useAbortableTasks } from "@/components/workflow/useAbortableTasks";
import { groupInOrder } from "@/lib/collections";
import { downloadImageAsset } from "@/lib/imageWorkflow";
import {
  deleteModelAsset,
  generateImage,
  getImageProviders,
  isAbortError,
  listModelAssets,
  saveGeneratedImage,
  saveLibraryAssets,
} from "@/lib/workflowClient";
import {
  aspectRatioStyle,
  BUILT_IN_IMAGE_TEMPLATES,
  CUSTOM_TEMPLATE_CATEGORY,
  groupModelProfiles,
  IMAGE_FACTORY_STORAGE_KEY,
  LIBRARY_COPY,
  loadCustomImageTemplates,
  type CliProviderStatus,
  type ImageCliProvider,
  type ImageFactoryTemplate,
  type ImageGenerationResult,
  type ImageTemplateSlot,
  type ImageTemplateView,
  type LibraryKind,
  type ModelAssetEntry,
  type ModelProfile,
} from "@/lib/imageFactory";

const GENERATE_TASK_KEY = "imageFactory.generate";
const OUTPUT_DIR_STORAGE_KEY = "vibenote.image-factory.output-dir.v1";
const ENGINE_STORAGE_KEY = "vibenote.image-factory.engine.v1";

/** 模特库里的图存在服务端，塞回上传槽位前先取回来包成 File，走的还是同一条 multipart 链路。 */
async function modelAssetToFile(entry: ModelAssetEntry): Promise<File> {
  const blob = await (await fetch(entry.imageUrl)).blob();
  return new File([blob], `model-${entry.id}${entry.extension}`, { type: blob.type || "image/png" });
}

/**
 * CLI 状态检查要 spawn 好几个子进程，代价不小；而它在一次会话里几乎不变。
 * 切换产出类型会反复重渲染本组件，用一份模块级短缓存挡住重复探测，手动刷新仍然直连。
 */
const PROVIDER_CACHE_TTL_MS = 60_000;
let providerCache: { at: number; providers: CliProviderStatus[] } | null = null;

/** 入库默认名：同一次运行出的多张图归到同一个主体名下，主体叫什么按库走。 */
function defaultAssetName(kind: LibraryKind): string {
  const now = new Date();
  return `${LIBRARY_COPY[kind].subject} ${now.getMonth() + 1}-${now.getDate()}`;
}

interface SelectedInput {
  slotId: string;
  file: File;
  previewUrl: string;
}

/** 选中的模特身份：图 + 描述一起交给后端，跨产出跨场景才是同一个人。 */
interface ModelIdentity {
  name: string;
  traits: string;
}

/** 一次运行里的一个生成任务：一个产出类型 × 一个视角（没有视角的产出就是它自己）。 */
interface GenerationJob {
  /** 唯一标识，同时当后端产物子目录名，多产出同跑时互不覆盖 */
  key: string;
  template: ImageFactoryTemplate;
  view: ImageTemplateView | null;
}

interface RunResult {
  job: GenerationJob;
  result: ImageGenerationResult;
  /** 存进输出目录后的绝对路径；没设目录或存失败就没有 */
  savedPath?: string;
  saveError?: string;
}

/** 产物文件名：日期 + 产出类型 + 视角，直接能认出是什么，重名由服务端顺延 */
function buildFileName(job: GenerationJob): string {
  const today = new Date().toISOString().slice(0, 10);
  const viewPart = job.view ? `-${job.view.label}` : "";
  return `${today}-${job.template.name}${viewPart}`;
}

export default function ImageFactory({
  onUseAsCover,
  incomingTemplateId,
  onTemplateConsumed,
  incomingBrief,
  onBriefConsumed,
}: {
  onUseAsCover?: (dataUrl: string) => void;
  /** 从模板目录点进来时带的模板 id，进来即选中它。 */
  incomingTemplateId?: string | null;
  onTemplateConsumed?: () => void;
  /** 首页那句话判成「做图」时带过来的要求，填进当前产出的补充要求。 */
  incomingBrief?: string | null;
  onBriefConsumed?: () => void;
}) {
  const tasks = useAbortableTasks();
  const [customTemplates, setCustomTemplates] = useState<ImageFactoryTemplate[]>([]);
  /**
   * 列表 ⇄ 详情两级：进来先看「能做哪些图」，点一张才进配置。
   * 17 个模板平铺在一条横滚 tab 里挑不动，配置区又长，两件事挤一屏只会互相打架。
   */
  const [view, setView] = useState<"list" | "detail">("list");
  /** 详情页正在配的产出类型，永远参与本次生成 */
  const [activeTemplateId, setActiveTemplateId] = useState(BUILT_IN_IMAGE_TEMPLATES[0].id);
  /** 额外加入本次批次的产出，配好一种就攒一种，最后一起跑 */
  const [batchIds, setBatchIds] = useState<string[]>([]);
  /** libraryFirst 的产出分两条路：直接用库里现成的，或者上传参考图生成 */
  const [assetMode, setAssetMode] = useState<"library" | "generate">("library");
  const [selectedInputs, setSelectedInputs] = useState<Record<string, SelectedInput>>({});
  /** 产出 -> 勾选的视图；没记录过的视为全选，省掉一次初始化 */
  const [viewPicks, setViewPicks] = useState<Record<string, string[]>>({});
  /** 补充要求按产出各记一份，攒批次时不会互相串味 */
  const [promptByTemplate, setPromptByTemplate] = useState<Record<string, string>>({});
  /** 人手点开的场景分组；没点过就跟着已选场景走，所以这里允许一直是空 */
  const [sceneGroupPick, setSceneGroupPick] = useState("");
  const [providers, setProviders] = useState<CliProviderStatus[]>([]);
  const [provider, setProvider] = useState<ImageCliProvider>("codex");
  /** 空串 = 跟随 CLI 自己的默认模型 */
  const [model, setModel] = useState("");
  const [results, setResults] = useState<RunResult[]>([]);
  const [runTotal, setRunTotal] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<ImageFactoryTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<ImageFactoryTemplate | null>(null);
  const [outputDir, setOutputDir] = useState("");
  const [modelAssets, setModelAssets] = useState<ModelAssetEntry[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  /** 正在为哪个槽位挑模特；null 表示选择器关着 */
  const [pickingSlot, setPickingSlot] = useState<ImageTemplateSlot | null>(null);
  /** 从库里选中的那位模特，生成时随图一起发给后端 */
  const [modelIdentity, setModelIdentity] = useState<ModelIdentity | null>(null);
  /**
   * 入库的名称与特征描述按库各存一份。
   * 一个批次里可能同时跑出模特图和商品图，两边共用一个输入框的话，
   * 先填的那个名字会被后填的覆盖，最后两个库都存错。
   */
  const [assetNames, setAssetNames] = useState<Partial<Record<LibraryKind, string>>>({});
  const [assetTraits, setAssetTraits] = useState<Partial<Record<LibraryKind, string>>>({});
  /** 产出 key -> 入库状态，整组入库时每张各自流转，避免重复存进库 */
  const [assetSaveState, setAssetSaveState] = useState<Record<string, "saving" | "saved">>({});
  const [libraryError, setLibraryError] = useState("");

  const templates = useMemo(() => [...BUILT_IN_IMAGE_TEMPLATES, ...customTemplates], [customTemplates]);
  const activeTemplate = templates.find((item) => item.id === activeTemplateId) || templates[0];
  /** 本次要跑的产出：当前 tab + 攒在批次里的，按模板表顺序排，结果区顺序才稳定 */
  const runTemplates = useMemo(
    () => templates.filter((item) => item.id === activeTemplate?.id || batchIds.includes(item.id)),
    [templates, activeTemplate?.id, batchIds],
  );

  const pickedViews = useCallback(
    (template: ImageFactoryTemplate) => {
      const views = template.views || [];
      const picks = viewPicks[template.id];
      return picks ? views.filter((view) => picks.includes(view.id)) : views;
    },
    [viewPicks],
  );

  /** 本次要跑的产出的槽位并集：白底图和详情图都只要一张商品图，就只让用户传一次 */
  const activeSlots = useMemo(() => {
    const merged = new Map<string, ImageTemplateSlot>();
    runTemplates.forEach((template) => {
      template.slots.forEach((slot) => {
        const existing = merged.get(slot.id);
        // 同一个槽位被两种产出共用时，必传的那份说明才是准的——「可选」的文案配上必传星号会自相矛盾
        if (!existing || (slot.required && !existing.required)) merged.set(slot.id, slot);
      });
    });
    return [...merged.values()];
  }, [runTemplates]);

  const jobs = useMemo<GenerationJob[]>(
    () =>
      runTemplates.flatMap<GenerationJob>((template) => {
        const views = template.views || [];
        if (views.length === 0) return [{ key: template.id, template, view: null }];
        return pickedViews(template).map((view) => ({ key: `${template.id}__${view.id}`, template, view }));
      }),
    [runTemplates, pickedViews],
  );

  // 每次渲染都新建一个空数组的话，下面按它分组的 useMemo 等于没缓存
  const activeViews = useMemo(() => activeTemplate?.views || [], [activeTemplate]);
  /** 当前这批产出里要不要选模特；有就把模特库摆到台面上，而不是藏在弹窗后面 */
  const modelSlot = activeSlots.find((slot) => slot.fromModelLibrary) || null;
  const modelProfiles = useMemo(() => groupModelProfiles(modelAssets), [modelAssets]);
  const viewGroups = useMemo(() => groupInOrder(activeViews, (view) => view.group || ""), [activeViews]);

  const customPrompt = activeTemplate ? promptByTemplate[activeTemplate.id] || "" : "";
  const scenePresets = useMemo(() => activeTemplate?.scenePresets || [], [activeTemplate]);
  // 选中态直接由输入框内容反推：手改一个字就自动脱离选中，不用再维护一份状态
  const activeScenePresetId = scenePresets.find((preset) => preset.prompt === customPrompt)?.id || null;
  const sceneGroups = useMemo(() => groupInOrder(scenePresets, (preset) => preset.group || ""), [scenePresets]);
  /**
   * 上身场景图把四个模板合成了一个，场景预设有 51 条，一次平铺没人看得完。
   * 分了组就先选一组再看这组里的场景；展开哪一组优先跟着已选的那条走，人手点过则听人的。
   */
  const groupedScenes = sceneGroups.length > 1;
  const pickedSceneGroup = scenePresets.find((preset) => preset.id === activeScenePresetId)?.group || "";
  const activeSceneGroup = sceneGroups.some((group) => group.key === sceneGroupPick)
    ? sceneGroupPick
    : pickedSceneGroup || sceneGroups[0]?.key || "";
  const visibleScenePresets = groupedScenes
    ? sceneGroups.find((group) => group.key === activeSceneGroup)?.items || []
    : scenePresets;
  const activePicks = activeTemplate ? pickedViews(activeTemplate).map((view) => view.id) : [];
  const inBatch = activeTemplate ? batchIds.includes(activeTemplate.id) : false;
  const showLibraryBoard = Boolean(activeTemplate?.libraryFirst) && assetMode === "library";

  const requiredReady = activeSlots.filter((slot) => slot.required).every((slot) => Boolean(selectedInputs[slot.id]));
  const selectedProvider = providers.find((item) => item.id === provider);
  const providerReady = Boolean(selectedProvider?.available && selectedProvider.authenticated);
  const canGenerate = requiredReady && jobs.length > 0 && providerReady && !isGenerating;
  const blockReason = jobs.length === 0
    ? "当前产出至少要勾一个输出视图"
    : !requiredReady
      ? "请先上传所有必传素材"
      : "";

  const resultGroups = useMemo(
    () =>
      groupInOrder(results, (item) => item.job.template.id).map(({ items }) => ({
        template: items[0].job.template,
        items,
      })),
    [results],
  );

  const applyProviders = useCallback((list: CliProviderStatus[]) => {
    setProviders(list);
    setProvider((current) => {
      const chosen = list.find((item) => item.id === current);
      if (chosen?.available && chosen.authenticated) return current;
      return list.find((item) => item.available && item.authenticated)?.id || current;
    });
  }, []);

  const refreshProviders = useCallback(async (force = false) => {
    if (!force && providerCache && Date.now() - providerCache.at < PROVIDER_CACHE_TTL_MS) {
      applyProviders(providerCache.providers);
      setIsLoadingProviders(false);
      return;
    }
    setIsLoadingProviders(true);
    try {
      const data = await getImageProviders();
      providerCache = { at: Date.now(), providers: data.providers };
      applyProviders(data.providers);
    } catch (error) {
      console.error("[ImageFactory] CLI 状态检查失败", { action: "imageFactory.providers", error });
    } finally {
      setIsLoadingProviders(false);
    }
  }, [applyProviders]);

  // 从模板目录带着一个模板进来：选中它，随即把入参交还给调用方，避免切走再回来又被强制选回去
  useEffect(() => {
    if (!incomingTemplateId) return;
    setActiveTemplateId(incomingTemplateId);
    setView("detail");
    onTemplateConsumed?.();
  }, [incomingTemplateId, onTemplateConsumed]);

  // 首页带来的要求填进补充要求。已经写过的不覆盖——手打的永远比转述的准。
  useEffect(() => {
    if (!incomingBrief) return;
    setPromptByTemplate((current) =>
      current[activeTemplateId] ? current : { ...current, [activeTemplateId]: incomingBrief },
    );
    onBriefConsumed?.();
  }, [incomingBrief, activeTemplateId, onBriefConsumed]);

  useEffect(() => {
    setCustomTemplates(loadCustomImageTemplates());
    setOutputDir(localStorage.getItem(OUTPUT_DIR_STORAGE_KEY) || "");
    try {
      const saved = JSON.parse(localStorage.getItem(ENGINE_STORAGE_KEY) || "{}");
      if (typeof saved.model === "string") setModel(saved.model);
      if (saved.provider === "codex" || saved.provider === "grok" || saved.provider === "gemini") {
        setProvider(saved.provider);
      }
    } catch (error) {
      console.warn("[ImageFactory] 引擎偏好读取失败", { action: "imageFactory.loadEngine", error });
    }
  }, []);

  useEffect(() => {
    refreshProviders();
  }, [refreshProviders]);

  // 卸载时统一回收预览用的 object URL；依赖数组必须为空，否则会撤销仍在用的地址
  const inputsRef = useRef(selectedInputs);
  inputsRef.current = selectedInputs;
  useEffect(() => () => {
    Object.values(inputsRef.current).forEach((input) => URL.revokeObjectURL(input.previewUrl));
  }, []);

  const rememberEngine = (next: { provider?: ImageCliProvider; model?: string }) => {
    localStorage.setItem(
      ENGINE_STORAGE_KEY,
      JSON.stringify({ provider: next.provider ?? provider, model: next.model ?? model }),
    );
  };

  const selectProvider = (next: ImageCliProvider) => {
    setProvider(next);
    // 模型名是跟着引擎走的，换引擎必须清掉，否则会把 grok 的模型名塞给 codex
    setModel("");
    rememberEngine({ provider: next, model: "" });
  };

  const selectModel = (next: string) => {
    setModel(next);
    rememberEngine({ model: next });
  };

  // 列表只有元数据，图片由 <Image> 各自按需取，所以要选模特的产出一进来就拉一次
  const refreshModelAssets = useCallback(async () => {
    setIsLoadingModels(true);
    setLibraryError("");
    try {
      const data = await listModelAssets();
      setModelAssets(data.models);
    } catch (error) {
      console.error("[ImageFactory] 模特库读取失败", { action: "imageFactory.models.list", error });
      setLibraryError(error instanceof Error ? error.message : "模特库读取失败");
    } finally {
      setModelsLoaded(true);
      setIsLoadingModels(false);
    }
  }, []);

  // 要选模特的产出一进来就把库读出来，模特模板条不能等用户先点开弹窗
  useEffect(() => {
    if (modelSlot && !modelsLoaded && !isLoadingModels) refreshModelAssets();
  }, [modelSlot, modelsLoaded, isLoadingModels, refreshModelAssets]);

  const openModelLibrary = (slot: ImageTemplateSlot) => {
    setPickingSlot(slot);
    refreshModelAssets();
  };

  const selectTemplate = (templateId: string) => {
    setActiveTemplateId(templateId);
    setView("detail");
    setAssetMode(templates.find((item) => item.id === templateId)?.libraryFirst ? "library" : "generate");
    setResults([]);
    setErrorMessage("");
  };

  const toggleBatch = () => {
    if (!activeTemplate) return;
    setBatchIds((current) =>
      current.includes(activeTemplate.id)
        ? current.filter((id) => id !== activeTemplate.id)
        : [...current, activeTemplate.id],
    );
  };

  /** 直接指定当前产出要出哪几个视角，全选 / 清空 / 成组快选都走它。 */
  const pickViews = (viewIds: string[]) => {
    if (!activeTemplate) return;
    setViewPicks({ ...viewPicks, [activeTemplate.id]: viewIds });
  };

  /** 整组勾上；已经全在里面就整组去掉。 */
  const toggleViewGroup = (groupIds: string[]) => {
    const allPicked = groupIds.every((id) => activePicks.includes(id));
    pickViews(
      allPicked
        ? activePicks.filter((id) => !groupIds.includes(id))
        : [...activePicks, ...groupIds.filter((id) => !activePicks.includes(id))],
    );
  };

  const toggleView = (templateId: string, viewId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const current = viewPicks[templateId] || (template.views || []).map((view) => view.id);
    const next = current.includes(viewId) ? current.filter((id) => id !== viewId) : [...current, viewId];
    setViewPicks({ ...viewPicks, [templateId]: next });
  };

  const setPrompt = (value: string) => {
    if (!activeTemplate) return;
    setPromptByTemplate((current) => ({ ...current, [activeTemplate.id]: value }));
  };

  const toggleScenePreset = (presetId: string) => {
    const preset = scenePresets.find((item) => item.id === presetId);
    if (!preset) return;
    setPrompt(customPrompt === preset.prompt ? "" : preset.prompt);
  };

  const selectInput = (slotId: string, file: File) => {
    setSelectedInputs((current) => {
      const previous = current[slotId];
      if (previous) URL.revokeObjectURL(previous.previewUrl);
      return { ...current, [slotId]: { slotId, file, previewUrl: URL.createObjectURL(file) } };
    });
    setResults([]);
  };

  const pickModelAsset = async (slot: ImageTemplateSlot, pick: ModelPick) => {
    try {
      selectInput(slot.id, await modelAssetToFile(pick.asset));
      setModelIdentity({ name: pick.name, traits: pick.traits });
      setPickingSlot(null);
    } catch (error) {
      console.error("[ImageFactory] 模特图载入失败", {
        action: "imageFactory.models.pick",
        modelId: pick.asset.id,
        slotId: slot.id,
        error,
      });
      setLibraryError("这张模特图读不出来，换一张或重新生成");
    }
  };

  /** 从模特模板条选一位：拿她最能锁脸的那张填进槽位，体貌描述一并带上。 */
  const selectModelProfile = async (profile: ModelProfile) => {
    if (!modelSlot) return;
    try {
      selectInput(modelSlot.id, await modelAssetToFile(profile.cover));
      setModelIdentity({ name: profile.name, traits: profile.traits });
    } catch (error) {
      console.error("[ImageFactory] 模特图载入失败", {
        action: "imageFactory.models.selectProfile",
        modelId: profile.cover.id,
        slotId: modelSlot.id,
        error,
      });
      setLibraryError("这位模特的图读不出来，换一位或去模特库里挑一张");
    }
  };

  /** 库里缺的角度交给生成那条路：锁定的模特不变，只把缺的视角勾上。 */
  const generateMissingViews = (viewIds: string[]) => {
    pickViews(viewIds);
    setAssetMode("generate");
  };

  /** 整组或单张都走这一条：一次请求存完，服务端只读写一次索引。 */
  const saveToLibrary = async (kind: LibraryKind, items: RunResult[]) => {
    const pending = items.filter((item) => !assetSaveState[item.job.key]);
    if (pending.length === 0) return;

    const label = LIBRARY_COPY[kind].label;
    const name = (assetNames[kind] || "").trim() || defaultAssetName(kind);
    const traits = (assetTraits[kind] || "").trim();
    setAssetSaveState((current) => ({
      ...current,
      ...Object.fromEntries(pending.map((item) => [item.job.key, "saving" as const])),
    }));
    setLibraryError("");
    try {
      await saveLibraryAssets(
        kind,
        pending.map(({ job, result }) => ({
          sourcePath: result.outputPath,
          name,
          sourceLabel: job.view?.label || job.template.name,
          traits,
        })),
      );
      setAssetSaveState((current) => ({
        ...current,
        ...Object.fromEntries(pending.map((item) => [item.job.key, "saved" as const])),
      }));
    } catch (error) {
      console.error(`[ImageFactory] 存入${label}失败`, {
        action: `imageFactory.${kind}.save`,
        jobKeys: pending.map((item) => item.job.key),
        error,
      });
      setLibraryError(error instanceof Error ? error.message : `存入${label}失败`);
      // 失败的这批退回未入库，让用户能重试
      setAssetSaveState((current) => {
        const next = { ...current };
        pending.forEach((item) => delete next[item.job.key]);
        return next;
      });
    }
  };

  const removeModelAsset = async (entry: ModelAssetEntry) => {
    if (!window.confirm(`确认把「${entry.name}」的这张图从模特库移除吗？`)) return;
    try {
      await deleteModelAsset(entry.id);
      setModelAssets((current) => current.filter((item) => item.id !== entry.id));
    } catch (error) {
      console.error("[ImageFactory] 移除模特失败", { action: "imageFactory.models.delete", modelId: entry.id, error });
      setLibraryError(error instanceof Error ? error.message : "移除模特失败");
    }
  };

  const removeInput = (slotId: string) => {
    setSelectedInputs((current) => {
      const next = { ...current };
      if (next[slotId]) URL.revokeObjectURL(next[slotId].previewUrl);
      delete next[slotId];
      return next;
    });
    // 槽位空了就没有那位模特了，身份描述不能继续跟着跑
    if (activeSlots.find((slot) => slot.id === slotId)?.fromModelLibrary) setModelIdentity(null);
  };

  const saveTemplate = (template: ImageFactoryTemplate) => {
    const next = customTemplates.some((item) => item.id === template.id)
      ? customTemplates.map((item) => item.id === template.id ? template : item)
      : [...customTemplates, template];
    setCustomTemplates(next);
    localStorage.setItem(IMAGE_FACTORY_STORAGE_KEY, JSON.stringify(next));
    // 编辑时删掉的视图要从勾选里清掉，新增的视图默认选上
    setViewPicks({ ...viewPicks, [template.id]: (template.views || []).map((view) => view.id) });
    setActiveTemplateId(template.id);
    setEditingTemplate(null);
  };

  const deleteTemplate = (templateId: string) => {
    const template = customTemplates.find((item) => item.id === templateId);
    if (!template || !window.confirm(`确认删除自定义产出“${template.name}”吗？`)) return;
    const next = customTemplates.filter((item) => item.id !== templateId);
    setCustomTemplates(next);
    localStorage.setItem(IMAGE_FACTORY_STORAGE_KEY, JSON.stringify(next));
    setBatchIds((current) => current.filter((id) => id !== templateId));
    if (activeTemplateId === templateId) setActiveTemplateId(BUILT_IN_IMAGE_TEMPLATES[0].id);
  };

  /**
   * 所有任务串行发请求：出一张显示一张，中途可中止，也不用把后端改成长任务。
   * 每个任务带自己的 key 当产物子目录，多产出同跑不会互相覆盖。
   */
  const generate = async () => {
    const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const signal = tasks.start(GENERATE_TASK_KEY);
    const collected: RunResult[] = [];

    setIsGenerating(true);
    setErrorMessage("");
    setResults([]);
    setAssetSaveState({});
    setLibraryError("");
    setRunTotal(jobs.length);

    try {
      for (const job of jobs) {
        const formData = new FormData();
        formData.set("provider", provider);
        if (model) formData.set("model", model);
        formData.set("jobId", runId);
        formData.set("templateId", job.template.id);
        formData.set("templateName", job.template.name);
        formData.set("templateCategory", job.template.category);
        formData.set("templatePrompt", job.template.prompt);
        formData.set("customPrompt", promptByTemplate[job.template.id] || "");
        // 头肩近景和全身站姿不该是同一个画幅，视角自己声明了就以它为准
        formData.set("aspectRatio", job.view?.aspectRatio || job.template.aspectRatio);
        formData.set("viewId", job.key);
        if (job.view) {
          formData.set("viewLabel", job.view.label);
          formData.set("viewHint", job.view.hint);
        }
        // 只有真用到模特槽位的产出才带身份，商品白底图不需要也不该被人物描述干扰
        const usesModelSlot = job.template.slots.some((slot) => slot.fromModelLibrary && selectedInputs[slot.id]);
        if (modelIdentity && usesModelSlot) {
          formData.set("identityName", modelIdentity.name);
          formData.set("identityTraits", modelIdentity.traits);
        }
        job.template.slots.forEach((slot) => {
          const input = selectedInputs[slot.id];
          if (!input) return;
          formData.append("inputLabel", slot.label);
          formData.append("inputFile", input.file);
        });

        const result = await generateImage(formData, signal);
        const entry: RunResult = { job, result };
        // 设了输出目录就随生成随存，跑完就能直接去目录里拿图，不用一张张点下载
        if (outputDir.trim()) {
          try {
            const saved = await saveGeneratedImage({
              sourcePath: result.outputPath,
              targetDir: outputDir.trim(),
              fileName: buildFileName(job),
            });
            entry.savedPath = saved.savedPath;
          } catch (error) {
            console.error("[ImageFactory] 保存到输出目录失败", {
              action: "imageFactory.save",
              templateId: job.template.id,
              outputDir,
              error,
            });
            entry.saveError = error instanceof Error ? error.message : "保存失败";
          }
        }
        collected.push(entry);
        setResults([...collected]);
      }
    } catch (error) {
      const aborted = isAbortError(error);
      console.error("[ImageFactory] 生成中断", {
        action: "imageFactory.generate",
        templateIds: runTemplates.map((item) => item.id),
        provider,
        model: model || "default",
        runId,
        done: collected.length,
        total: jobs.length,
        error,
      });
      setErrorMessage(
        aborted
          ? `已中止，保留了先生成好的 ${collected.length} 张`
          : error instanceof Error ? error.message : "目标图生成失败",
      );
    } finally {
      tasks.finish(GENERATE_TASK_KEY);
      setIsGenerating(false);
    }
  };

  const downloadResult = ({ job, result }: RunResult) => {
    const viewPart = job.view ? `-${job.view.label}` : "";
    downloadImageAsset(result.imageDataUrl, `${job.template.name}${viewPart}-${result.jobId}${result.extension}`);
  };

  const newTemplateDraft = () => ({
    id: `custom-${Date.now().toString(36)}`,
    name: "新产出",
    category: CUSTOM_TEMPLATE_CATEGORY,
    description: "",
    prompt: "",
    aspectRatio: "1:1",
    slots: [{ id: "subject", label: "主体图", description: "", required: true }],
  });

  if (!activeTemplate) return null;

  // 第一级：只挑模板，不做配置
  if (view === "list") {
    return (
      <div className="space-y-4">
        <ImageTemplateList
          templates={templates}
          batchIds={batchIds}
          onSelect={selectTemplate}
          onCreate={() => setEditingTemplate(newTemplateDraft())}
        />
        {editingTemplate && (
          <TemplateEditor
            template={editingTemplate}
            categories={[...new Set(templates.map((item) => item.category))]}
            onCancel={() => setEditingTemplate(null)}
            onSave={saveTemplate}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card flush>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setView("list")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-faint hover:bg-soft hover:text-ink"
              aria-label="返回模板列表"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-[15px] font-bold leading-tight text-ink">{activeTemplate.name}</h2>
                {!activeTemplate.builtIn && <Badge tone="brand">自建</Badge>}
              </div>
              <p className="mt-0.5 text-[11px] leading-4 text-faint">
                {activeTemplate.category}
                <span className="ml-1.5">· {activeTemplate.aspectRatio}</span>
                {activeViews.length > 0 && <span className="ml-1.5">· {activeViews.length} 视图</span>}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!activeTemplate.builtIn && (
              <>
                <button type="button" onClick={() => setEditingTemplate(activeTemplate)} className="rounded-xl p-1.5 text-faint hover:text-brand-600" aria-label={`编辑${activeTemplate.name}`}>
                  <Pencil size={13} />
                </button>
                <button type="button" onClick={() => deleteTemplate(activeTemplate.id)} className="rounded-xl p-1.5 text-faint hover:text-danger" aria-label={`删除${activeTemplate.name}`}>
                  <Trash2 size={13} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={toggleBatch}
              className={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                inBatch ? "bg-brand-100 text-brand-700" : "bg-surface text-brand-600 hover:bg-brand-50"
              }`}
            >
              {inBatch ? "已在批次中 · 移出" : "+ 加入批次"}
            </button>
          </div>
        </div>
      </Card>

      {activeTemplate.libraryFirst && (
        <SegmentedControl
          value={assetMode}
          options={[
            { value: "library", label: "用内置模特", description: "库里已有全部角度，选中直接取图" },
            { value: "generate", label: "生成新的", description: "上传参考图，按选中的视角生成" },
          ]}
          onChange={setAssetMode}
          ariaLabel="模特来源"
        />
      )}

      {showLibraryBoard ? (
        <ModelLibraryBoard
          profiles={modelProfiles}
          loading={isLoadingModels}
          errorMessage={libraryError}
          selectedName={modelIdentity?.name || ""}
          views={activeViews}
          onSelect={selectModelProfile}
          onDelete={removeModelAsset}
          onGenerateMissing={generateMissingViews}
        />
      ) : (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.62fr)]">
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-ink">① 上传素材</h2>
                <p className="mt-0.5 text-xs text-faint">
                  {activeSlots.length > 0 ? "本次要跑的产出共需要这些图，传一次就够" : "这种产出不需要素材，直接生成"}
                </p>
              </div>
              {activeSlots.length > 0 && (
                <span className="text-[11px] font-bold text-faint">
                  {activeSlots.filter((slot) => slot.required).length} 张必传
                </span>
              )}
            </div>

            {modelSlot && (
              <div className="mt-4">
                <ModelTemplateStrip
                  profiles={modelProfiles}
                  loading={isLoadingModels}
                  activeName={modelIdentity?.name || ""}
                  onSelect={selectModelProfile}
                  onClear={() => removeInput(modelSlot.id)}
                  onManage={() => openModelLibrary(modelSlot)}
                />
              </div>
            )}

            {/* 只有一个槽位时不铺满整列：4:3 的框拉到一整列宽就有半屏高，把下面的配置全顶出视野 */}
            <div className={`mt-4 grid gap-3 ${activeSlots.length > 1 ? "sm:grid-cols-2" : "max-w-[340px]"}`}>
              {activeSlots.map((slot) => {
                const input = selectedInputs[slot.id];
                return (
                  <div key={slot.id} className="relative overflow-hidden rounded-2xl border border-dashed border-line-strong bg-soft">
                    {input ? (
                      <div className="relative aspect-[4/3]">
                        <Image src={input.previewUrl} alt={`${slot.label}预览`} fill sizes="420px" className="object-cover" unoptimized />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 text-white">
                          <div className="text-xs font-bold">{slot.label}</div>
                          <div className="mt-0.5 truncate text-[10px] text-white/70">
                            {slot.fromModelLibrary && modelIdentity ? `模特：${modelIdentity.name}` : input.file.name}
                          </div>
                        </div>
                        <div className="absolute right-2 top-2 flex gap-1.5">
                          {slot.fromModelLibrary && (
                            <button type="button" onClick={() => openModelLibrary(slot)} className="rounded-full bg-black/55 p-1.5 text-white" aria-label={`从模特库换一位${slot.label}`}>
                              <UserRound size={13} />
                            </button>
                          )}
                          <button type="button" onClick={() => removeInput(slot.id)} className="rounded-full bg-black/55 p-1.5 text-white" aria-label={`移除${slot.label}`}>
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex aspect-[4/3] flex-col">
                        <label className="flex flex-1 cursor-pointer flex-col items-center justify-center p-5 text-center hover:bg-brand-50/50">
                          <ImagePlus size={26} className="text-brand-400" />
                          <span className="mt-2.5 text-sm font-bold text-ink">
                            {slot.label}
                            {slot.required && <span className="text-danger"> *</span>}
                          </span>
                          <span className="mt-1 text-[11px] leading-4 text-faint">{slot.description || "点击选择图片"}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) selectInput(slot.id, file);
                              event.target.value = "";
                            }}
                          />
                        </label>
                        {slot.fromModelLibrary && (
                          <button
                            type="button"
                            onClick={() => openModelLibrary(slot)}
                            className="flex items-center justify-center gap-1.5 border-t border-dashed border-line-strong py-2 text-[11px] font-bold text-brand-600 hover:bg-brand-50"
                          >
                            <UserRound size={13} />
                            从模特库选
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {activeSlots.length === 0 && (
                <div className="rounded-2xl bg-soft px-4 py-8 text-center text-xs text-faint">这种产出按文字描述直接生成，不用传图</div>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-[15px] font-bold text-ink">② 想要什么画面</h2>
            {scenePresets.length > 0 && (
              <div className="mt-3 rounded-2xl bg-soft p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold text-muted">画面场景</h3>
                  <span className="text-[11px] text-faint">点选替换下方内容，可继续手改</span>
                </div>
                {/* 合并出来的模板场景多到 51 条，先选一组再看这组，比一次铺满一屏可读 */}
                {groupedScenes && (
                  <div className="-mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-1">
                    {sceneGroups.map((group) => {
                      const cover = group.items.find((preset) => preset.preview)?.preview;
                      const opened = group.key === activeSceneGroup;
                      return (
                        <button
                          key={group.key}
                          type="button"
                          role="tab"
                          aria-selected={opened}
                          onClick={() => setSceneGroupPick(group.key)}
                          className={`flex shrink-0 items-center gap-2 rounded-xl border py-1 pl-1 pr-2.5 transition-colors ${
                            opened ? "border-brand-400 bg-brand-50" : "border-line bg-surface hover:border-brand-300"
                          }`}
                        >
                          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-soft">
                            {cover && <Image src={cover} alt="" fill sizes="32px" className="object-cover" unoptimized />}
                          </span>
                          <span className="text-left">
                            <span className={`block text-[11px] font-bold ${opened ? "text-brand-700" : "text-muted"}`}>
                              {group.key || "其它"}
                            </span>
                            <span className="block text-[10px] text-faint">{group.items.length} 个场景</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {visibleScenePresets.map((preset) => {
                    const checked = activeScenePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => toggleScenePreset(preset.id)}
                        title={preset.prompt}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                          checked
                            ? "border-brand-400 bg-brand-50 text-brand-700"
                            : "border-line bg-surface text-muted hover:border-brand-300 hover:text-ink"
                        }`}
                      >
                        {checked && <Check size={12} />}
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <textarea
              id="image-factory-prompt"
              value={customPrompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={3}
              placeholder="补充要求，例如：背景改成日落海边，人物自然站立，画面不要文字……"
              className="mt-3 w-full resize-y rounded-2xl border border-line bg-soft px-3.5 py-3 text-sm leading-6 text-ink outline-none transition focus:border-brand-300 focus:bg-surface"
            />
            <p className="mt-2 text-[11px] leading-5 text-faint">
              这段只跟着「{activeTemplate.name}」走；批次里其他产出各记各的补充要求。
            </p>
          </Card>

          {activeViews.length > 0 && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[15px] font-bold text-ink">
                  ③ 输出视图
                  <span className="ml-2 text-[11px] font-normal text-faint">已选 {activePicks.length} / {activeViews.length}</span>
                </h2>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => pickViews(activeViews.map((view) => view.id))} className="rounded-lg px-2 py-1 text-[11px] font-bold text-brand-600 hover:bg-brand-50">全选</button>
                  <button type="button" onClick={() => pickViews([])} className="rounded-lg px-2 py-1 text-[11px] font-bold text-faint hover:text-danger">清空</button>
                </div>
              </div>
              {viewGroups.map((group) => (
                <div key={group.key || "all"} className="mt-3">
                  {/* 分了组的模板（九宫格 / 三视图）给一键，13 个格子一个个点太蠢 */}
                  {group.key && (
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="text-xs font-bold text-muted">
                        {group.key}
                        <span className="ml-1.5 font-normal text-faint">{group.items.length} 张</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => toggleViewGroup(group.items.map((view) => view.id))}
                        className="rounded-lg px-2 py-1 text-[11px] font-bold text-brand-600 hover:bg-brand-50"
                      >
                        {group.items.every((view) => activePicks.includes(view.id)) ? "取消这组" : "选中这组"}
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {group.items.map((view) => {
                  const checked = activePicks.includes(view.id);
                  return (
                    <button
                      key={view.id}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggleView(activeTemplate.id, view.id)}
                      title={view.hint}
                      className={`overflow-hidden rounded-2xl border text-left transition-colors ${
                        checked ? "border-brand-400 bg-brand-50" : "border-line bg-surface hover:border-brand-300"
                      }`}
                    >
                      {/* 有样例就摆出来——「4 视图」这三个字说不清每个视角拍成什么样。
                          框按这个视角自己的画幅取形：头肩近景和全身站姿本就不是同一个比例，
                          一律摆成正方形等于把这个差别抹掉。 */}
                      <div
                        style={aspectRatioStyle(view.aspectRatio || activeTemplate.aspectRatio)}
                        className="relative border-b border-line bg-soft"
                      >
                        {view.preview ? (
                          <Image src={view.preview} alt="" fill sizes="140px" className={`object-contain ${checked ? "" : "opacity-85"}`} unoptimized />
                        ) : (
                          <span className="flex h-full items-center justify-center px-2 text-center text-[10px] leading-4 text-faint">{view.hint || "暂无样例"}</span>
                        )}
                        {checked && (
                          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white shadow-brand">
                            <Check size={11} strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className={`truncate px-2 py-1.5 text-[11px] font-bold ${checked ? "text-brand-700" : "text-muted"}`}>{view.label}</div>
                    </button>
                  );
                })}
                  </div>
                </div>
              ))}
            </Card>
          )}

          <Card>
            <div className="mb-3">
              <DirectoryField
                label="输出目录"
                hint="填了就随生成随存，跑完直接去目录里拿图；留空只在结果区下载"
                value={outputDir}
                onChange={(value) => {
                  setOutputDir(value);
                  // 只读不写的话，设完目录一刷新就没了
                  localStorage.setItem(OUTPUT_DIR_STORAGE_KEY, value);
                }}
                placeholder="留空则不自动保存"
              />
            </div>
            <Button
              block
              size="lg"
              variant="ai"
              disabled={!canGenerate}
              loading={isGenerating}
              onClick={generate}
              icon={<Sparkles size={16} />}
            >
              {isGenerating
                ? `正在生成第 ${Math.min(results.length + 1, runTotal)}/${runTotal} 张`
                : jobs.length > 1 ? `生成 ${jobs.length} 张目标图` : "生成目标图"}
            </Button>
            {isGenerating && (
              <button type="button" onClick={() => tasks.cancel(GENERATE_TASK_KEY)} className="mt-2 w-full rounded-xl py-1.5 text-xs font-bold text-faint hover:text-danger">
                中止生成
              </button>
            )}
            {!isGenerating && blockReason && <Callout tone="warn" className="mt-2 text-center">{blockReason}</Callout>}
            {!isGenerating && !blockReason && !providerReady && (
              <Callout tone="warn" className="mt-2 text-center">右侧选一个已登录的生成引擎</Callout>
            )}
            {errorMessage && <Callout tone="danger" className="mt-3">{errorMessage}</Callout>}
          </Card>

          {results.length > 0 && (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-bold text-ink">目标图</h2>
                  <p className="mt-0.5 text-[11px] text-faint">同时保存在本机任务目录</p>
                </div>
                {results.length > 1 && (
                  <button type="button" onClick={() => results.forEach(downloadResult)} className="rounded-xl px-2.5 py-2 text-xs font-bold text-brand-600 hover:bg-brand-50">
                    下载全部
                  </button>
                )}
              </div>
              <div className="mt-4 space-y-5">
                {resultGroups.map((group) => {
                  // 产出归哪个库由模板自己声明；没声明的产出不入库，也就不给入库表单
                  const assetKind = group.template.producesAsset || null;
                  const assetCopy = assetKind ? LIBRARY_COPY[assetKind] : null;
                  return (
                    <div key={group.template.id}>
                      <h3 className="text-xs font-bold text-muted">
                        {group.template.name}
                        <span className="ml-1.5 font-normal text-faint">{group.items.length} 张</span>
                      </h3>
                      {assetKind && assetCopy && (
                        <div className="mt-2 space-y-2 rounded-2xl bg-soft p-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <label htmlFor={`image-factory-asset-name-${assetKind}`} className="text-[11px] font-bold text-muted">
                              {assetCopy.subject}名称
                            </label>
                            <input
                              id={`image-factory-asset-name-${assetKind}`}
                              value={assetNames[assetKind] || ""}
                              onChange={(event) => setAssetNames((current) => ({ ...current, [assetKind]: event.target.value }))}
                              placeholder={defaultAssetName(assetKind)}
                              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-ink outline-none transition focus:border-brand-300"
                            />
                            <button
                              type="button"
                              onClick={() => saveToLibrary(assetKind, group.items)}
                              className="rounded-xl bg-brand-50 px-2.5 py-1.5 text-[11px] font-bold text-brand-600 hover:bg-brand-100"
                            >
                              整组存入{assetCopy.label}
                            </button>
                          </div>
                          <textarea
                            value={assetTraits[assetKind] || ""}
                            onChange={(event) => setAssetTraits((current) => ({ ...current, [assetKind]: event.target.value }))}
                            rows={2}
                            placeholder={assetCopy.traitsPlaceholder}
                            className="w-full resize-y rounded-xl border border-line bg-surface px-2.5 py-2 text-[11px] leading-5 text-ink outline-none transition focus:border-brand-300"
                          />
                          <p className="text-[10px] leading-4 text-faint">{assetCopy.traitsHint}</p>
                        </div>
                      )}
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        {group.items.map((item) => {
                          const saveState = assetSaveState[item.job.key];
                          return (
                            <div key={item.job.key} className="group">
                              <div className="relative overflow-hidden rounded-2xl border border-line bg-soft">
                                {/* 产出框按这一张实际要的画幅取形——跑出来的图被裁成 4:5 再看，等于没法验收 */}
                                <div
                                  style={aspectRatioStyle(item.job.view?.aspectRatio || item.job.template.aspectRatio)}
                                  className="relative"
                                >
                                  <Image src={item.result.imageDataUrl} alt={`${group.template.name}产出`} fill sizes="320px" className="object-contain" unoptimized />
                                </div>
                                <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                                  {assetKind && assetCopy && (
                                    <button
                                      type="button"
                                      disabled={Boolean(saveState)}
                                      onClick={() => saveToLibrary(assetKind, [item])}
                                      className={`rounded-xl p-2 text-white ${saveState === "saved" ? "bg-ok/80" : "bg-black/55"} disabled:cursor-default`}
                                      aria-label={`${saveState === "saved" ? "已存入" : "存入"}${assetCopy.label}`}
                                    >
                                      {saveState === "saving" ? (
                                        <Loader2 size={13} className="animate-spin" />
                                      ) : saveState === "saved" ? (
                                        <Check size={13} />
                                      ) : (
                                        <BookmarkPlus size={13} />
                                      )}
                                    </button>
                                  )}
                                  {group.template.handoff === "cover" && onUseAsCover && (
                                    <button
                                      type="button"
                                      onClick={() => onUseAsCover(item.result.imageDataUrl)}
                                      className="rounded-xl bg-black/55 p-2 text-white"
                                      aria-label="拿这张去叠标题"
                                    >
                                      <Type size={13} />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => downloadResult(item)}
                                    className="rounded-xl bg-black/55 p-2 text-white"
                                    aria-label="下载这张"
                                  >
                                    <Download size={13} />
                                  </button>
                                </div>
                              </div>
                              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-muted">
                                {item.job.view?.label}
                                {saveState === "saved" && <span className="text-ok">已入库</span>}
                              </p>
                              {item.savedPath && (
                                <p className="truncate text-[10px] text-faint" title={item.savedPath}>已存到 {item.savedPath}</p>
                              )}
                              {item.saveError && (
                                <p className="text-[10px] text-danger">保存到输出目录失败：{item.saveError}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {group.template.handoff === "cover" && onUseAsCover && (
                        <p className="mt-2 text-[10px] leading-4 text-faint">
                          底图不带文字。点图上的「T」把它送进封面编辑器叠标题，中文字才不会糊。
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {libraryError && <Callout tone="danger" className="mt-3">{libraryError}</Callout>}
              {isGenerating && results.length < runTotal && (
                <div className="mt-3 flex items-center gap-2 rounded-2xl bg-soft p-3 text-xs text-faint">
                  <Loader2 size={14} className="animate-spin" />
                  还有 {runTotal - results.length} 张在跑
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <TemplateSpecCard template={activeTemplate} onZoom={() => setPreviewTemplate(activeTemplate)} />

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-ink">本次生成</h2>
                <p className="mt-0.5 text-[11px] text-faint">共 {jobs.length} 张，逐张排队跑</p>
              </div>
              <Layers size={15} className="shrink-0 text-faint" />
            </div>
            <div className="mt-3 space-y-1.5">
              {runTemplates.map((template) => {
                const count = jobs.filter((job) => job.template.id === template.id).length;
                const isActive = template.id === activeTemplate.id;
                return (
                  <div
                    key={template.id}
                    className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${isActive ? "bg-brand-50" : "bg-soft"}`}
                  >
                    <span className={`min-w-0 flex-1 truncate text-xs font-bold ${isActive ? "text-brand-700" : "text-muted"}`}>
                      {template.name}
                      {isActive && <span className="ml-1.5 font-normal text-faint">当前</span>}
                    </span>
                    <span className="shrink-0 text-[10px] text-faint">{count} 张</span>
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => setBatchIds((current) => current.filter((id) => id !== template.id))}
                        className="shrink-0 rounded-lg p-1 text-faint hover:text-danger"
                        aria-label={`把${template.name}移出批次`}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {batchIds.length === 0 && (
              <p className="mt-2 text-[10px] leading-4 text-faint">
                想一次出多种图，就在上面配好一种点「加入批次」，再切下一种。素材只传一次。
              </p>
            )}
          </Card>

          <ImageEngineCard
            providers={providers}
            provider={provider}
            model={model}
            isLoading={isLoadingProviders}
            onSelectProvider={selectProvider}
            onSelectModel={selectModel}
            onRefresh={() => refreshProviders(true)}
          />
        </div>
      </div>
      )}

      {previewTemplate && <PreviewLightbox template={previewTemplate} onClose={() => setPreviewTemplate(null)} />}

      {pickingSlot && (
        <ModelLibraryPicker
          slotLabel={pickingSlot.label}
          assets={modelAssets}
          loading={isLoadingModels}
          errorMessage={libraryError}
          onPick={(pick) => pickModelAsset(pickingSlot, pick)}
          onDelete={removeModelAsset}
          onClose={() => setPickingSlot(null)}
        />
      )}

      {editingTemplate && (
        <TemplateEditor
          template={editingTemplate}
          categories={[...new Set(templates.map((item) => item.category))]}
          onCancel={() => setEditingTemplate(null)}
          onSave={saveTemplate}
        />
      )}
    </div>
  );
}
