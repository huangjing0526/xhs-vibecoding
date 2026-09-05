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
  Pencil,
  Sparkles,
  Trash2,
  Type,
  X,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import DirectoryField from "@/components/workflow/DirectoryField";
import ImageEngineCard from "@/components/workflow/ImageEngineCard";
import AssetPickerDialog from "@/components/workflow/AssetPickerDialog";
import TemplateSpecCard from "@/components/workflow/TemplateSpecCard";
import TemplateEditor, { PreviewLightbox } from "@/components/workflow/ImageTemplateEditor";
import { useAbortableTasks } from "@/components/workflow/useAbortableTasks";
import { groupInOrder } from "@/lib/collections";
import { downloadImageAsset } from "@/lib/imageWorkflow";
import {
  loadProviders,
  pickUsableProvider,
  readEnginePreference,
  writeEnginePreference,
} from "@/lib/enginePreference";
import {
  generateImage,
  isAbortError,
  saveGeneratedImage,
  saveLibraryAssets,
} from "@/lib/workflowClient";
import {
  aspectRatioStyle,
  IMAGE_PROVIDER_CAPS,
  ratioIsEnforced,
  BUILT_IN_IMAGE_TEMPLATES,
  deleteCustomImageTemplate,
  imageTemplateCategories,
  LIBRARY_COPY as ASSET_LIBRARY_COPY,
  LIBRARY_SLOT_IDS,
  LIBRARY_COPY,
  loadCustomImageTemplates,
  saveCustomImageTemplate,
  type CliProviderStatus,
  type ImageCliProvider,
  type ImageFactoryTemplate,
  type ImageGenerationResult,
  type ImageTemplateSlot,
  type LibraryAssetEntry,
  type ImageTemplateView,
  type LibraryKind,
} from "@/lib/imageFactory";

const GENERATE_TASK_KEY = "imageFactory.generate";
const OUTPUT_DIR_STORAGE_KEY = "vibenote.image-factory.output-dir.v1";

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
  onBackToTemplates,
  incomingAsset,
  onAssetConsumed,
  incomingBrief,
  onBriefConsumed,
}: {
  onUseAsCover?: (dataUrl: string) => void;
  /** 从模板目录点进来时带的模板 id，进来即选中它。 */
  incomingTemplateId?: string | null;
  onTemplateConsumed?: () => void;
  /** 回模板目录换一个模板——这里不再自带目录，挑模板只有那一处。 */
  onBackToTemplates: () => void;
  /** 资产页「用这位生成」带过来的一张，进来即落进对应槽位。 */
  incomingAsset?: { asset: LibraryAssetEntry; kind: LibraryKind } | null;
  onAssetConsumed?: () => void;
  /** 首页那句话判成「做图」时带过来的要求，填进当前产出的补充要求。 */
  incomingBrief?: string | null;
  onBriefConsumed?: () => void;
}) {
  const tasks = useAbortableTasks();
  const [customTemplates, setCustomTemplates] = useState<ImageFactoryTemplate[]>([]);
  /** 正在配的产出类型，永远参与本次生成。挑哪个模板由模板目录决定，这里只管跑。 */
  const [activeTemplateId, setActiveTemplateId] = useState(BUILT_IN_IMAGE_TEMPLATES[0].id);
  /** 额外加入本次批次的产出，配好一种就攒一种，最后一起跑 */
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [selectedInputs, setSelectedInputs] = useState<Record<string, SelectedInput>>({});
  /** 正在给哪个槽位从资产库挑图；null 表示弹层关着 */
  const [pickingSlot, setPickingSlot] = useState<ImageTemplateSlot | null>(null);
  /** 产出 -> 勾选的视图；没记录过的视为全选，省掉一次初始化 */
  const [viewPicks, setViewPicks] = useState<Record<string, string[]>>({});
  /** 补充要求按产出各记一份，攒批次时不会互相串味 */
  const [promptByTemplate, setPromptByTemplate] = useState<Record<string, string>>({});
  /** 人手点开的场景分组；没点过就跟着已选场景走，所以这里允许一直是空 */
  const [sceneGroupPick, setSceneGroupPick] = useState("");
  /** 人手点开的视图分组 tab；没点过就落在第一组 */
  const [viewGroupPick, setViewGroupPick] = useState("");
  /** 产出 -> 选中的人设包；随生成追加进提示词，不写进补充要求输入框 */
  const [stylePicks, setStylePicks] = useState<Record<string, string>>({});
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
  /** 「这一批要跑它吗」只有这一条判据，下面两个列表都从它派生，免得反面写错。 */
  const inRun = useCallback(
    (template: ImageFactoryTemplate) => template.id === activeTemplate?.id || batchIds.includes(template.id),
    [activeTemplate?.id, batchIds],
  );

  /** 本次要跑的产出：当前 tab + 攒在批次里的，按模板表顺序排，结果区顺序才稳定 */
  const runTemplates = useMemo(() => templates.filter(inRun), [templates, inRun]);

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
  const stylePresets = activeTemplate?.stylePresets || [];
  /** 传了模特参考图就不再叠人设——身份跟参考图走，文字人设只会和它打架 */
  const styleLocked = (template: ImageFactoryTemplate) =>
    template.slots.some((slot) => slot.id === "model") && Boolean(selectedInputs["model"]);
  const activeStyleLocked = activeTemplate ? styleLocked(activeTemplate) : false;
  const activeStyleId = activeTemplate ? stylePicks[activeTemplate.id] || "" : "";
  /**
   * 视图分组多于一组就切成 tab：模特资产图一次 13 个格子平铺下来要滚两屏，
   * 分成「定妆主图 / 全身三视图 / 头部九宫格」后一次只看一组。
   */
  const groupedViews = viewGroups.length > 1;
  const activeViewGroup = viewGroups.some((group) => group.key === viewGroupPick)
    ? viewGroupPick
    : viewGroups[0]?.key || "";
  const visibleViewGroups = groupedViews
    ? viewGroups.filter((group) => group.key === activeViewGroup)
    : viewGroups;
  const activePicks = activeTemplate ? pickedViews(activeTemplate).map((view) => view.id) : [];
  const inBatch = activeTemplate ? batchIds.includes(activeTemplate.id) : false;
  /** 还能加进这一批的产出，按分类分好组——分组是渲染下拉时的真开销，别留在 JSX 里每次重算 */
  const addableGroups = useMemo(
    () => groupInOrder(templates.filter((item) => !inRun(item)), (item) => item.category),
    [templates, inRun],
  );
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
    setProvider((current) => pickUsableProvider(list, current));
  }, []);

  const refreshProviders = useCallback(async (force = false) => {
    setIsLoadingProviders(true);
    try {
      applyProviders(await loadProviders(force));
    } catch (error) {
      console.error("[ImageFactory] CLI 状态检查失败", { action: "imageFactory.providers", error });
    } finally {
      setIsLoadingProviders(false);
    }
  }, [applyProviders]);

  /**
   * 换一个模板要跑的那套：切 id、清掉上一个模板的结果。
   * 模板目录是唯一的入口，所以这里只有一个调用点，但清理动作漏一样都会串味，还是收成一个函数。
   */
  const selectTemplate = useCallback((templateId: string) => {
    setActiveTemplateId(templateId);
    setResults([]);
    setErrorMessage("");
  }, []);

  // 从模板目录带着一个模板进来：选中它，随即把入参交还给调用方，避免切走再回来又被强制选回去
  useEffect(() => {
    if (!incomingTemplateId) return;
    selectTemplate(incomingTemplateId);
    onTemplateConsumed?.();
  }, [incomingTemplateId, onTemplateConsumed, selectTemplate]);

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
    // 首页那个选择器写的是同一份偏好，所以从首页选完进来，这里已经是选好的
    const saved = readEnginePreference();
    setProvider(saved.provider);
    setModel(saved.model);
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
    writeEnginePreference({ provider: next.provider ?? provider, model: next.model ?? model });
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

  /** 人设包单选，再点一次取消。 */
  const toggleStylePreset = (presetId: string) => {
    if (!activeTemplate) return;
    setStylePicks((current) => ({
      ...current,
      [activeTemplate.id]: current[activeTemplate.id] === presetId ? "" : presetId,
    }));
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

  // 粘贴截图直接进槽位：按槽位顺序填第一个空的；全满就不动——替换该由人先点移除。
  // 只认剪贴板里的图片，粘文字进输入框不受影响。
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.items || [])]
        .find((item) => item.kind === "file" && item.type.startsWith("image/"))
        ?.getAsFile();
      if (!file) return;
      const slot = activeSlots.find((item) => !selectedInputs[item.id]);
      if (!slot) return;
      event.preventDefault();
      selectInput(slot.id, file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  /**
   * 从资产库取一张填进槽位。
   * 资产图挂在同源路由上，取回来包成 File 就能复用「上传」那条通路——
   * 槽位、校验、FormData 全不用动，服务端也不用知道这张图是传的还是取的。
   */
  const fillSlotFromAsset = useCallback(async (slot: ImageTemplateSlot, entry: LibraryAssetEntry, kind: LibraryKind) => {
    try {
      const response = await fetch(entry.imageUrl);
      if (!response.ok) throw new Error(`资产图取回失败（${response.status}）`);
      const blob = await response.blob();
      const file = new File([blob], `${entry.name}${entry.extension}`, { type: blob.type });
      selectInput(slot.id, file);
      // 特征描述是这条资产锁得住身份的原因，取用时一并带进补充要求，别让它留在库里当摆设
      if (entry.traits?.trim()) {
        setPromptByTemplate((current) => {
          const existing = current[activeTemplateId] || "";
          return existing.includes(entry.traits!.trim())
            ? current
            : { ...current, [activeTemplateId]: [existing, entry.traits!.trim()].filter(Boolean).join("\n") };
        });
      }
    } catch (error) {
      console.error("[ImageFactory] 资产取用失败", {
        action: "imageFactory.pickFromLibrary",
        kind,
        assetId: entry.id,
        error,
      });
      setErrorMessage(
        error instanceof Error ? error.message : `从${ASSET_LIBRARY_COPY[kind].label}取图失败`,
      );
    }
  }, [activeTemplateId]);

  /**
   * 资产页带过来的那一位：按槽位 id 落进对的位置。
   *
   * 靠 id 而不是靠 label 猜——「模特图」「出镜的人」都可能是同一个槽位，
   * 而 id 是语义化的，对上就是确定的。对不上宁可不放：把一张商品图塞进模特位，
   * 要跑完一轮出了图才发现，比让人手动挑一次贵得多。
   */
  useEffect(() => {
    if (!incomingAsset || !activeTemplate) return;
    const wanted = LIBRARY_SLOT_IDS[incomingAsset.kind];
    const slot = activeTemplate.slots.find((item) => wanted.includes(item.id));
    if (slot) {
      fillSlotFromAsset(slot, incomingAsset.asset, incomingAsset.kind);
    } else {
      setErrorMessage(
        `这个模板没有放${ASSET_LIBRARY_COPY[incomingAsset.kind].subject}的槽位，用槽位上的「从资产里选」手动放。`,
      );
    }
    onAssetConsumed?.();
  }, [incomingAsset, activeTemplate, fillSlotFromAsset, onAssetConsumed]);

  /** 弹层选中一条：填进当时点开它的那个槽位。 */
  const pickFromLibrary = (entry: LibraryAssetEntry, kind: LibraryKind) => {
    const slot = pickingSlot;
    if (!slot) return;
    setPickingSlot(null);
    fillSlotFromAsset(slot, entry, kind);
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

  const removeInput = (slotId: string) => {
    setSelectedInputs((current) => {
      const next = { ...current };
      if (next[slotId]) URL.revokeObjectURL(next[slotId].previewUrl);
      delete next[slotId];
      return next;
    });
  };

  const saveTemplate = (template: ImageFactoryTemplate) => {
    try {
      setCustomTemplates(saveCustomImageTemplate(template));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "模板没能存进本机");
      return;
    }
    // 编辑时删掉的视图要从勾选里清掉，新增的视图默认选上
    setViewPicks({ ...viewPicks, [template.id]: (template.views || []).map((view) => view.id) });
    setActiveTemplateId(template.id);
    setEditingTemplate(null);
  };

  const deleteTemplate = (templateId: string) => {
    const template = customTemplates.find((item) => item.id === templateId);
    if (!template || !window.confirm(`确认删除自定义产出“${template.name}”吗？`)) return;
    setCustomTemplates(deleteCustomImageTemplate(templateId));
    setBatchIds((current) => current.filter((id) => id !== templateId));
    // 删的正是手上这个：这里没有目录可退，送回模板目录重挑
    if (activeTemplateId === templateId) onBackToTemplates();
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
        // 人设包随生成追加，不占用户手打的补充要求；传了模特参考图就不叠，身份跟图走
        const stylePreset = styleLocked(job.template)
          ? undefined
          : (job.template.stylePresets || []).find((preset) => preset.id === stylePicks[job.template.id]);
        formData.set(
          "customPrompt",
          [promptByTemplate[job.template.id] || "", stylePreset ? `人物设定：${stylePreset.prompt}` : ""]
            .filter(Boolean)
            .join("\n"),
        );
        // 头肩近景和全身站姿不该是同一个画幅，视角自己声明了就以它为准
        formData.set("aspectRatio", job.view?.aspectRatio || job.template.aspectRatio);
        formData.set("viewId", job.key);
        if (job.view) {
          formData.set("viewLabel", job.view.label);
          formData.set("viewHint", job.view.hint);
        }
        // 每个视角都把同一份上传素材再发一次：身份、服装这些一致性全靠这张参考图
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

  if (!activeTemplate) return null;

  return (
    <div className="space-y-4">
      <Card flush>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={onBackToTemplates}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-faint hover:bg-soft hover:text-ink"
              aria-label="回模板目录换一个"
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
                {/* 比例保不保证由引擎决定：CLI 那两条只是把它写进提示词，模型尽力而为 */}
                {!ratioIsEnforced(provider, activeTemplate.aspectRatio) && (
                  <span
                    className="ml-1.5 text-warn"
                    title={
                      IMAGE_PROVIDER_CAPS[provider].aspectRatios.length
                        ? `${selectedProvider?.name || provider} 不认 ${activeTemplate.aspectRatio}，会跟随参考图`
                        : `${selectedProvider?.name || provider} 不收比例参数，只能在提示词里交代，出来的比例不保证`
                    }
                  >
                    · 比例不保证
                  </span>
                )}
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

      {/* 左边是要动手的三步，右边只放参考——操作永远在视线落点上，1024 宽就能并排 */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.6fr)]">
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-ink">① 上传素材</h2>
                <p className="mt-0.5 text-xs text-faint">
                  {activeSlots.length > 0 ? "本次要跑的产出共需要这些图，传一次就够；截图可直接 ⌘V 粘贴进来" : "这种产出不需要素材，直接生成"}
                </p>
              </div>
              {activeSlots.length > 0 && (
                <span className="text-[11px] font-bold text-faint">
                  {activeSlots.filter((slot) => slot.required).length} 张必传
                </span>
              )}
            </div>

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
                          <div className="mt-0.5 truncate text-[10px] text-white/70">{input.file.name}</div>
                        </div>
                        <button type="button" onClick={() => removeInput(slot.id)} className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white" aria-label={`移除${slot.label}`}>
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center p-5 pb-10 text-center hover:bg-brand-50/50">
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
                        {/*
                          压在框底而不是放进 label 里：label 里的按钮点了会同时触发选文件。
                          与「上传」平级、不抢默认——主体该由人决定从哪来，进来先挑一位模特是反的。
                        */}
                        <button
                          type="button"
                          onClick={() => setPickingSlot(slot)}
                          className="absolute inset-x-0 bottom-0 border-t border-line bg-surface/90 py-2 text-[11px] font-bold text-brand-600 transition-colors hover:bg-brand-50"
                        >
                          从资产里选
                        </button>
                      </>
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
            {stylePresets.length > 0 && (
              <div className="mt-3 rounded-2xl bg-soft p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold text-muted">模特人设</h3>
                  <span className="text-[11px] text-faint">
                    {activeStyleLocked ? "已传模特参考，长相跟参考图走，人设不生效" : "单选随生成附加，不占下面的补充要求；再点一次取消"}
                  </span>
                </div>
                <div className={`mt-2.5 flex flex-wrap gap-2 ${activeStyleLocked ? "pointer-events-none opacity-40" : ""}`}>
                  {stylePresets.map((preset) => {
                    const checked = !activeStyleLocked && activeStyleId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => toggleStylePreset(preset.id)}
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
              {/* 样例里的那张脸是示意角度用的，不说清楚容易被当成「我会得到这个人」 */}
              <p className="mt-1.5 text-[11px] leading-4 text-faint">样例只示意这个角度长什么样，实际出图用你上传的素材。</p>
              {/* 分了组就切 tab，一次只看一组；勾选状态跨 tab 保留，右上角的计数仍是全模板的 */}
              {groupedViews && (
                <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
                  {viewGroups.map((group) => {
                    const cover = group.items.find((view) => view.preview)?.preview;
                    const opened = group.key === activeViewGroup;
                    const picked = group.items.filter((view) => activePicks.includes(view.id)).length;
                    return (
                      <button
                        key={group.key || "all"}
                        type="button"
                        role="tab"
                        aria-selected={opened}
                        onClick={() => setViewGroupPick(group.key)}
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
                          <span className="block text-[10px] text-faint">已选 {picked} / {group.items.length}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {visibleViewGroups.map((group) => (
                <div key={group.key || "all"} className="mt-3">
                  {/* 分了组的模板（九宫格 / 三视图）给一键，13 个格子一个个点太蠢 */}
                  {group.key && (
                    <div className="mb-2 flex items-center justify-between gap-3">
                      {/* 切了 tab 就别再把组名和张数写第二遍，tab 上已经有了 */}
                      {groupedViews ? <span /> : (
                        <h3 className="text-xs font-bold text-muted">
                          {group.key}
                          <span className="ml-1.5 font-normal text-faint">{group.items.length} 张</span>
                        </h3>
                      )}
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
                    {/*
                      批次里的另一种：点一下切过去接着配。
                      只切当前项——results 是整批共有的，用 selectTemplate 会把已经跑出来的全清掉。
                    */}
                    <button
                      type="button"
                      disabled={isActive}
                      onClick={() => setActiveTemplateId(template.id)}
                      className={`min-w-0 flex-1 truncate text-left text-xs font-bold ${
                        isActive ? "text-brand-700" : "text-muted hover:text-ink"
                      }`}
                    >
                      {template.name}
                      {isActive && <span className="ml-1.5 font-normal text-faint">当前</span>}
                    </button>
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

            {/*
              只往这一批里再加一种，不是第二个模板目录：没有样例、没有分类锚点，看模板去「模板」区。
              做成下拉而不是「回目录挑一个」，是因为回目录会把这个页面卸载——
              已经传好的素材、填好的补充要求、勾好的视角全没了，「素材只传一次」就成了空话。
            */}
            {addableGroups.length > 0 && (
              <select
                aria-label="再加一种产出到本次批次"
                value=""
                onChange={(event) => {
                  const templateId = event.target.value;
                  if (templateId) setBatchIds((current) => [...current, templateId]);
                }}
                className="mt-2 w-full rounded-xl border border-dashed border-line bg-surface px-3 py-2 text-[11px] font-bold text-muted outline-none transition focus:border-brand-300"
              >
                <option value="">+ 再加一种一起跑</option>
                {addableGroups.map((group) => (
                  <optgroup key={group.key} label={group.key}>
                    {group.items.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}

            {batchIds.length === 0 && (
              <p className="mt-2 text-[10px] leading-4 text-faint">
                想一次出多种图，就在上面配好一种，再从这里加下一种。素材只传一次。
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

      {previewTemplate && <PreviewLightbox template={previewTemplate} onClose={() => setPreviewTemplate(null)} />}

      {pickingSlot && (
        <AssetPickerDialog
          slotLabel={pickingSlot.label}
          onPick={pickFromLibrary}
          onClose={() => setPickingSlot(null)}
        />
      )}

      {editingTemplate && (
        <TemplateEditor
          template={editingTemplate}
          categories={imageTemplateCategories(customTemplates)}
          onCancel={() => setEditingTemplate(null)}
          onSave={saveTemplate}
        />
      )}
    </div>
  );
}
