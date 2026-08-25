"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { BookmarkPlus, Check, Download, ImagePlus, Loader2, Maximize2, Pencil, Plus, RefreshCw, Sparkles, Trash2, UserRound, X } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ModalOverlay from "@/components/ui/ModalOverlay";
import DirectoryField from "@/components/workflow/DirectoryField";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import TemplateThumb from "@/components/workflow/TemplateThumb";
import { useAbortableTasks } from "@/components/workflow/useAbortableTasks";
import { downloadImageAsset } from "@/lib/imageWorkflow";
import {
  deleteModelAsset,
  generateImage,
  getImageProviders,
  isAbortError,
  listModelAssets,
  saveGeneratedImage,
  saveModelAssets,
} from "@/lib/workflowClient";
import {
  BUILT_IN_IMAGE_TEMPLATES,
  IMAGE_FACTORY_STORAGE_KEY,
  type CliProviderStatus,
  type ImageCliProvider,
  IMAGE_TEMPLATE_THUMB_OPTIONS,
  type ImageFactoryTemplate,
  type ImageGenerationResult,
  type ImageTemplateSlot,
  type ImageTemplateThumb,
  type ImageTemplateView,
  type ModelAssetEntry,
} from "@/lib/imageFactory";

const GENERATE_TASK_KEY = "imageFactory.generate";
const OUTPUT_DIR_STORAGE_KEY = "vibenote.image-factory.output-dir.v1";

/** 模特库里的图存在服务端，塞回上传槽位前先取回来包成 File，走的还是同一条 multipart 链路。 */
async function modelAssetToFile(entry: ModelAssetEntry): Promise<File> {
  const blob = await (await fetch(entry.imageUrl)).blob();
  return new File([blob], `model-${entry.id}${entry.extension}`, { type: blob.type || "image/png" });
}

/**
 * CLI 状态检查要 spawn 好几个子进程，代价不小；而它在一次会话里几乎不变。
 * 合并成图片区后来回切分段会反复挂载本组件，用一份模块级短缓存挡住重复探测，手动刷新仍然直连。
 */
const PROVIDER_CACHE_TTL_MS = 60_000;
let providerCache: { at: number; providers: CliProviderStatus[] } | null = null;

/** 入库默认名：同一次运行出的多张视角图归到同一位模特名下。 */
function defaultModelName(): string {
  const now = new Date();
  return `模特 ${now.getMonth() + 1}-${now.getDate()}`;
}

interface SelectedInput {
  slotId: string;
  file: File;
  previewUrl: string;
}

function loadCustomTemplates(): ImageFactoryTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(IMAGE_FACTORY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[ImageFactory] 自建模板读取失败", { action: "imageFactory.loadTemplates", error });
    return [];
  }
}

function ProviderButton({
  provider,
  selected,
  onSelect,
}: {
  provider: CliProviderStatus;
  selected: boolean;
  onSelect: (provider: ImageCliProvider) => void;
}) {
  const enabled = provider.available && provider.authenticated;
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={() => onSelect(provider.id)}
      aria-pressed={selected}
      className={`rounded-2xl border p-3 text-left transition-all ${
        selected ? "border-brand-400 bg-brand-50 ring-2 ring-brand-100" : "border-line bg-surface"
      } ${enabled ? "hover:border-brand-300" : "cursor-not-allowed opacity-55"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink">{provider.name}</span>
        {enabled && <Check size={14} className="text-ok" />}
      </div>
      <p className="mt-1 text-[11px] leading-4 text-faint">{provider.message}</p>
    </button>
  );
}

/** 一次运行里的一个生成任务：一个产出类型 × 一个视角（没有视角的模板就是它自己）。 */
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

/** 产出类型行：左边小图点开看大图，整行点击切换勾选。 */
function TemplateRow({
  template,
  checked,
  focused,
  onToggle,
  onPreview,
  onEdit,
  onDelete,
}: {
  template: ImageFactoryTemplate;
  checked: boolean;
  focused: boolean;
  onToggle: (templateId: string) => void;
  onPreview: (template: ImageFactoryTemplate) => void;
  onEdit: (template: ImageFactoryTemplate) => void;
  onDelete: (templateId: string) => void;
}) {
  const viewCount = template.views?.length || 0;
  const requiredCount = template.slots.filter((slot) => slot.required).length;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-2xl border p-2 transition-colors ${
        checked ? "border-brand-300 bg-brand-50/70" : "border-line bg-surface hover:border-brand-200"
      } ${focused ? "ring-1 ring-brand-200" : ""}`}
    >
      <button
        type="button"
        onClick={() => onPreview(template)}
        className="group relative h-14 w-[3.2rem] shrink-0 overflow-hidden rounded-xl border border-line bg-soft"
        aria-label={`查看${template.name}的产出大图`}
      >
        {template.preview ? (
          <Image src={template.preview} alt="" fill sizes="56px" className="object-cover" unoptimized />
        ) : (
          <TemplateThumb thumb={template.thumb} active={checked} />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-ink/45 opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 size={13} className="text-white" />
        </span>
      </button>

      <button type="button" onClick={() => onToggle(template.id)} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <span
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[5px] border ${
              checked ? "border-brand-500 bg-brand-500 text-white" : "border-line-strong bg-surface"
            }`}
          >
            {checked && <Check size={10} strokeWidth={3} />}
          </span>
          <span className={`truncate text-[13px] font-bold ${checked ? "text-brand-700" : "text-ink"}`}>{template.name}</span>
          {!template.builtIn && <Badge tone="brand">自建</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] leading-4 text-faint">
          <span>{template.aspectRatio}</span>
          <span>· {requiredCount} 张素材</span>
          {viewCount > 0 && <span className="font-bold text-brand-500">· {viewCount} 视图</span>}
        </div>
      </button>

      {!template.builtIn && (
        <div className="flex shrink-0 flex-col gap-1">
          <button type="button" onClick={() => onEdit(template)} className="rounded-lg p-1 text-faint hover:text-brand-600" aria-label={`编辑${template.name}`}>
            <Pencil size={12} />
          </button>
          <button type="button" onClick={() => onDelete(template.id)} className="rounded-lg p-1 text-faint hover:text-danger" aria-label={`删除${template.name}`}>
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

/** 产出样例大图。点开只为看清效果，不承载操作。 */
function PreviewLightbox({ template, onClose }: { template: ImageFactoryTemplate; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${template.name}的产出样例`}
      onClick={onClose}
    >
      <div className="max-h-full w-full max-w-md overflow-auto rounded-3xl bg-surface p-4 shadow-pop" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">{template.name}</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted">{template.description || "未填写用途说明"}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl p-2 text-faint hover:bg-soft hover:text-ink" aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="relative mt-3 aspect-[4/5] overflow-hidden rounded-2xl border border-line bg-soft">
          {template.preview ? (
            <Image src={template.preview} alt={`${template.name}的产出样例`} fill sizes="420px" className="object-cover" unoptimized />
          ) : (
            <TemplateThumb thumb={template.thumb} />
          )}
        </div>
        {(template.views?.length || 0) > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-bold text-muted">一次出这几个视角</h3>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {(template.views || []).map((view) => (
                <div key={view.id}>
                  <div className="relative aspect-square overflow-hidden rounded-xl border border-line bg-soft">
                    {view.preview ? (
                      <Image src={view.preview} alt={view.label} fill sizes="96px" className="object-cover" unoptimized />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[10px] text-faint">暂无</span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[10px] font-bold text-muted" title={view.hint}>{view.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-5 text-faint">
          这是该产出类型跑出来的真实样例，换成你自己的素材会得到同样结构的图。
        </p>
      </div>
    </div>
  );
}

/** 模特库选择器：从已存的模特资产里挑一张塞进上传槽位，也在这里删掉不要的。 */
function ModelLibraryPicker({
  slotLabel,
  models,
  loading,
  errorMessage,
  onPick,
  onDelete,
  onClose,
}: {
  slotLabel: string;
  models: ModelAssetEntry[];
  loading: boolean;
  errorMessage: string;
  onPick: (entry: ModelAssetEntry) => void;
  onDelete: (entry: ModelAssetEntry) => void;
  onClose: () => void;
}) {
  return (
    <ModalOverlay onClose={onClose} maxWidthClass="max-w-2xl" ariaLabel="模特库">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">模特库</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted">挑一位存好的模特，填进「{slotLabel}」</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl p-2 text-faint hover:bg-soft hover:text-ink" aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        {errorMessage && <Callout tone="danger" className="mt-3">{errorMessage}</Callout>}

        {loading ? (
          <div className="mt-6 flex items-center justify-center gap-2 py-10 text-xs text-faint">
            <Loader2 size={14} className="animate-spin" />
            正在读取模特库
          </div>
        ) : models.length === 0 ? (
          <EmptyState
            bare
            icon={<UserRound size={22} />}
            title="模特库还是空的"
            description="用「模特资产图」跑一组，再把满意的存进来。"
          />
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {models.map((entry) => (
              <div key={entry.id} className="group">
                <button
                  type="button"
                  onClick={() => onPick(entry)}
                  className="relative block w-full overflow-hidden rounded-2xl border border-line bg-soft transition-colors hover:border-brand-400"
                >
                  <span className="relative block aspect-[3/4]">
                    <Image src={entry.imageUrl} alt={entry.name} fill sizes="180px" className="object-cover" unoptimized />
                  </span>
                </button>
                <div className="mt-1.5 flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold text-ink" title={entry.name}>{entry.name}</p>
                    {entry.sourceLabel && <p className="truncate text-[10px] text-faint">{entry.sourceLabel}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelete(entry)}
                    className="shrink-0 rounded-lg p-1 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    aria-label={`移除${entry.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </ModalOverlay>
  );
}

export default function ImageFactory() {
  const tasks = useAbortableTasks();
  const [customTemplates, setCustomTemplates] = useState<ImageFactoryTemplate[]>([]);
  // 产出类型可多选，一次排队跑完
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([BUILT_IN_IMAGE_TEMPLATES[0].id]);
  // 焦点决定「画面场景」显示谁的预设——多选时不可能同时显示所有模板的标签
  const [focusTemplateId, setFocusTemplateId] = useState(BUILT_IN_IMAGE_TEMPLATES[0].id);
  const [activeCategory, setActiveCategory] = useState(BUILT_IN_IMAGE_TEMPLATES[0].category);
  const [selectedInputs, setSelectedInputs] = useState<Record<string, SelectedInput>>({});
  /** 模板 -> 勾选的视图；没记录过的模板视为全选，省掉一次初始化 */
  const [viewPicks, setViewPicks] = useState<Record<string, string[]>>({});
  const [providers, setProviders] = useState<CliProviderStatus[]>([]);
  const [provider, setProvider] = useState<ImageCliProvider>("codex");
  const [customPrompt, setCustomPrompt] = useState("");
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
  /** 正在为哪个槽位挑模特；null 表示选择器关着 */
  const [pickingSlot, setPickingSlot] = useState<ImageTemplateSlot | null>(null);
  const [modelName, setModelName] = useState("");
  /** 产出 key -> 入库状态，整组入库时每张各自流转，避免重复存进模特库 */
  const [modelSaveState, setModelSaveState] = useState<Record<string, "saving" | "saved">>({});
  const [modelLibraryError, setModelLibraryError] = useState("");
  const defaultName = useMemo(defaultModelName, []);

  const templates = useMemo(() => [...BUILT_IN_IMAGE_TEMPLATES, ...customTemplates], [customTemplates]);
  const categories = useMemo(() => {
    const ordered: string[] = [];
    templates.forEach((template) => {
      if (!ordered.includes(template.category)) ordered.push(template.category);
    });
    return ordered;
  }, [templates]);
  const visibleTemplates = templates.filter((template) => template.category === activeCategory);
  const selectedTemplates = useMemo(
    () => templates.filter((template) => selectedTemplateIds.includes(template.id)),
    [templates, selectedTemplateIds],
  );
  const focusTemplate = selectedTemplates.find((template) => template.id === focusTemplateId) || selectedTemplates[0] || null;

  const pickedViews = useCallback(
    (template: ImageFactoryTemplate) => {
      const views = template.views || [];
      const picks = viewPicks[template.id];
      return picks ? views.filter((view) => picks.includes(view.id)) : views;
    },
    [viewPicks],
  );

  /** 选中模板的槽位并集：三个电商产出都只要一张商品图，就只让用户传一次 */
  const activeSlots = useMemo(() => {
    const merged = new Map<string, ImageTemplateSlot>();
    selectedTemplates.forEach((template) => {
      template.slots.forEach((slot) => {
        const existing = merged.get(slot.id);
        if (!existing) merged.set(slot.id, slot);
        else if (slot.required && !existing.required) merged.set(slot.id, { ...existing, required: true });
      });
    });
    return [...merged.values()];
  }, [selectedTemplates]);

  const jobs = useMemo<GenerationJob[]>(
    () =>
      selectedTemplates.flatMap<GenerationJob>((template) => {
        const views = template.views || [];
        if (views.length === 0) return [{ key: template.id, template, view: null }];
        return pickedViews(template).map((view) => ({ key: `${template.id}__${view.id}`, template, view }));
      }),
    [selectedTemplates, pickedViews],
  );

  const scenePresets = focusTemplate?.scenePresets || [];
  // 选中态直接由输入框内容反推：手改一个字就自动脱离选中，不用再维护一份状态
  const activeScenePresetId = scenePresets.find((preset) => preset.prompt === customPrompt)?.id || null;
  const requiredReady = activeSlots.filter((slot) => slot.required).every((slot) => Boolean(selectedInputs[slot.id]));
  const selectedProvider = providers.find((item) => item.id === provider);
  const providerReady = Boolean(selectedProvider?.available && selectedProvider.authenticated);
  const canGenerate = requiredReady && jobs.length > 0 && providerReady && !isGenerating;
  const blockReason = selectedTemplates.length === 0
    ? "请在右侧选择至少一种产出"
    : jobs.length === 0
      ? "选中的产出至少要勾一个输出视图"
      : !requiredReady
        ? "请先上传所有必传素材"
        : "";

  const resultGroups = useMemo(() => {
    const groups = new Map<string, { template: ImageFactoryTemplate; items: RunResult[] }>();
    results.forEach((item) => {
      const group = groups.get(item.job.template.id) || { template: item.job.template, items: [] };
      group.items.push(item);
      groups.set(item.job.template.id, group);
    });
    return [...groups.values()];
  }, [results]);

  const applyProviders = useCallback((list: CliProviderStatus[]) => {
    setProviders(list);
    const usable = list.find((item) => item.available && item.authenticated);
    if (usable) setProvider(usable.id);
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

  useEffect(() => {
    setCustomTemplates(loadCustomTemplates());
    setOutputDir(localStorage.getItem(OUTPUT_DIR_STORAGE_KEY) || "");
  }, []);

  // 只在打开选择器时拉，进页面不必背这份开销；列表只有元数据，图片由 <Image> 各自按需取
  const refreshModelAssets = async () => {
    setIsLoadingModels(true);
    setModelLibraryError("");
    try {
      const data = await listModelAssets();
      setModelAssets(data.models);
    } catch (error) {
      console.error("[ImageFactory] 模特库读取失败", { action: "imageFactory.models.list", error });
      setModelLibraryError(error instanceof Error ? error.message : "模特库读取失败");
    } finally {
      setIsLoadingModels(false);
    }
  };

  const openModelLibrary = (slot: ImageTemplateSlot) => {
    setPickingSlot(slot);
    refreshModelAssets();
  };

  useEffect(() => {
    refreshProviders();
  }, [refreshProviders]);

  // 卸载时统一回收预览用的 object URL；依赖数组必须为空，否则会撤销仍在用的地址
  const inputsRef = useRef(selectedInputs);
  inputsRef.current = selectedInputs;
  useEffect(() => () => {
    Object.values(inputsRef.current).forEach((input) => URL.revokeObjectURL(input.previewUrl));
  }, []);

  // 删掉最后一个自建模板会让当前分类消失，回落到第一个分类
  useEffect(() => {
    if (categories.length > 0 && !categories.includes(activeCategory)) setActiveCategory(categories[0]);
  }, [categories, activeCategory]);

  const toggleTemplate = (templateId: string) => {
    const next = selectedTemplateIds.includes(templateId)
      ? selectedTemplateIds.filter((id) => id !== templateId)
      : [...selectedTemplateIds, templateId];
    setSelectedTemplateIds(next);
    // 勾上就跟着聚焦；取消掉的话焦点让给还选着的第一个
    setFocusTemplateId(next.includes(templateId) ? templateId : next[0] || templateId);
    setResults([]);
    setErrorMessage("");
  };

  const toggleView = (templateId: string, viewId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const current = viewPicks[templateId] || (template.views || []).map((view) => view.id);
    const next = current.includes(viewId) ? current.filter((id) => id !== viewId) : [...current, viewId];
    setViewPicks({ ...viewPicks, [templateId]: next });
  };

  const toggleScenePreset = (presetId: string) => {
    const preset = scenePresets.find((item) => item.id === presetId);
    if (!preset) return;
    setCustomPrompt((current) => current === preset.prompt ? "" : preset.prompt);
  };

  const selectInput = (slotId: string, file: File) => {
    setSelectedInputs((current) => {
      const previous = current[slotId];
      if (previous) URL.revokeObjectURL(previous.previewUrl);
      return { ...current, [slotId]: { slotId, file, previewUrl: URL.createObjectURL(file) } };
    });
    setResults([]);
  };

  const pickModelAsset = async (slot: ImageTemplateSlot, entry: ModelAssetEntry) => {
    try {
      selectInput(slot.id, await modelAssetToFile(entry));
      setPickingSlot(null);
    } catch (error) {
      console.error("[ImageFactory] 模特图载入失败", {
        action: "imageFactory.models.pick",
        modelId: entry.id,
        slotId: slot.id,
        error,
      });
      setModelLibraryError("这张模特图读不出来，换一张或重新生成");
    }
  };

  /** 整组或单张都走这一条：一次请求存完，服务端只读写一次索引。 */
  const saveToModelLibrary = async (items: RunResult[]) => {
    const pending = items.filter((item) => !modelSaveState[item.job.key]);
    if (pending.length === 0) return;

    const name = modelName.trim() || defaultName;
    setModelSaveState((current) => ({
      ...current,
      ...Object.fromEntries(pending.map((item) => [item.job.key, "saving" as const])),
    }));
    setModelLibraryError("");
    try {
      await saveModelAssets(
        pending.map(({ job, result }) => ({
          sourcePath: result.outputPath,
          name,
          sourceLabel: [job.template.name, job.view?.label].filter(Boolean).join(" · "),
        })),
      );
      setModelSaveState((current) => ({
        ...current,
        ...Object.fromEntries(pending.map((item) => [item.job.key, "saved" as const])),
      }));
    } catch (error) {
      console.error("[ImageFactory] 存入模特库失败", {
        action: "imageFactory.models.save",
        jobKeys: pending.map((item) => item.job.key),
        error,
      });
      setModelLibraryError(error instanceof Error ? error.message : "存入模特库失败");
      // 失败的这批退回未入库，让用户能重试
      setModelSaveState((current) => {
        const next = { ...current };
        pending.forEach((item) => delete next[item.job.key]);
        return next;
      });
    }
  };

  const removeModelAsset = async (entry: ModelAssetEntry) => {
    if (!window.confirm(`确认把「${entry.name}」从模特库移除吗？`)) return;
    try {
      await deleteModelAsset(entry.id);
      setModelAssets((current) => current.filter((item) => item.id !== entry.id));
    } catch (error) {
      console.error("[ImageFactory] 移除模特失败", { action: "imageFactory.models.delete", modelId: entry.id, error });
      setModelLibraryError(error instanceof Error ? error.message : "移除模特失败");
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
    const next = customTemplates.some((item) => item.id === template.id)
      ? customTemplates.map((item) => item.id === template.id ? template : item)
      : [...customTemplates, template];
    setCustomTemplates(next);
    localStorage.setItem(IMAGE_FACTORY_STORAGE_KEY, JSON.stringify(next));
    if (!selectedTemplateIds.includes(template.id)) setSelectedTemplateIds([...selectedTemplateIds, template.id]);
    setFocusTemplateId(template.id);
    // 编辑时删掉的视图要从勾选里清掉，新增的视图默认选上
    setViewPicks({ ...viewPicks, [template.id]: (template.views || []).map((view) => view.id) });
    setActiveCategory(template.category);
    setEditingTemplate(null);
  };

  const deleteTemplate = (templateId: string) => {
    const template = customTemplates.find((item) => item.id === templateId);
    if (!template || !window.confirm(`确认删除自定义模板“${template.name}”吗？`)) return;
    const next = customTemplates.filter((item) => item.id !== templateId);
    setCustomTemplates(next);
    localStorage.setItem(IMAGE_FACTORY_STORAGE_KEY, JSON.stringify(next));
    setSelectedTemplateIds((current) => current.filter((id) => id !== templateId));
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
    setModelSaveState({});
    setModelLibraryError("");
    setRunTotal(jobs.length);

    try {
      for (const job of jobs) {
        const formData = new FormData();
        formData.set("provider", provider);
        formData.set("jobId", runId);
        formData.set("templateName", job.template.name);
        formData.set("templatePrompt", job.template.prompt);
        formData.set("customPrompt", customPrompt);
        formData.set("aspectRatio", job.template.aspectRatio);
        formData.set("viewId", job.key);
        if (job.view) {
          formData.set("viewLabel", job.view.label);
          formData.set("viewHint", job.view.hint);
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
        templateIds: selectedTemplateIds,
        provider,
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

  const viewTemplates = selectedTemplates.filter((template) => (template.views?.length || 0) > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.62fr)]">
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-ink">① 上传素材</h2>
                <p className="mt-0.5 text-xs text-faint">
                  {activeSlots.length > 0 ? "右侧选中的产出共需要这些图，传一次就够" : "先在右侧选一种产出"}
                </p>
              </div>
              {activeSlots.length > 0 && (
                <span className="text-[11px] font-bold text-faint">
                  {activeSlots.filter((slot) => slot.required).length} 张必传
                </span>
              )}
            </div>

            <div className={`mt-4 grid gap-3 ${activeSlots.length > 1 ? "sm:grid-cols-2" : ""}`}>
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
                <div className="rounded-2xl bg-soft px-4 py-8 text-center text-xs text-faint">选中产出后，这里会列出要传的素材</div>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-[15px] font-bold text-ink">② 想要什么画面</h2>
            {scenePresets.length > 0 && (
              <div className="mt-3 rounded-2xl bg-soft p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold text-muted">
                    画面场景
                    {selectedTemplates.length > 1 && focusTemplate && (
                      <span className="ml-1.5 font-normal text-faint">来自「{focusTemplate.name}」</span>
                    )}
                  </h3>
                  <span className="text-[11px] text-faint">点选替换下方内容，可继续手改</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {scenePresets.map((preset) => {
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
              onChange={(event) => setCustomPrompt(event.target.value)}
              rows={3}
              placeholder="补充要求，例如：背景改成日落海边，人物自然站立，画面不要文字……"
              className="mt-3 w-full resize-y rounded-2xl border border-line bg-soft px-3.5 py-3 text-sm leading-6 text-ink outline-none transition focus:border-brand-300 focus:bg-surface"
            />
            <p className="mt-2 text-[11px] leading-5 text-faint">这段会加到每个产出的生成要求里，各产出自己的规则不受影响。</p>
          </Card>

          {viewTemplates.length > 0 && (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-bold text-ink">③ 输出视图</h2>
                <span className="text-[11px] text-faint">逐张生成，出一张显一张</span>
              </div>
              <div className="mt-3 space-y-3">
                {viewTemplates.map((template) => {
                  const picks = pickedViews(template).map((view) => view.id);
                  return (
                    <div key={template.id}>
                      <h3 className="text-xs font-bold text-muted">{template.name}</h3>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {(template.views || []).map((view) => {
                          const checked = picks.includes(view.id);
                          return (
                            <button
                              key={view.id}
                              type="button"
                              role="checkbox"
                              aria-checked={checked}
                              onClick={() => toggleView(template.id, view.id)}
                              title={view.hint}
                              className={`overflow-hidden rounded-2xl border text-left transition-colors ${
                                checked ? "border-brand-400 bg-brand-50" : "border-line bg-surface hover:border-brand-300"
                              }`}
                            >
                              {/* 有样例就摆出来——「4 视图」这三个字说不清每个视角拍成什么样 */}
                              <div className="relative aspect-square border-b border-line bg-soft">
                                {view.preview ? (
                                  <Image src={view.preview} alt="" fill sizes="140px" className={`object-cover ${checked ? "" : "opacity-85"}`} unoptimized />
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
                  );
                })}
              </div>
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
                  const isModelAsset = Boolean(group.template.producesModelAsset);
                  return (
                    <div key={group.template.id}>
                      <h3 className="text-xs font-bold text-muted">
                        {group.template.name}
                        <span className="ml-1.5 font-normal text-faint">{group.items.length} 张</span>
                      </h3>
                      {isModelAsset && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-soft p-2.5">
                          <label htmlFor="image-factory-model-name" className="text-[11px] font-bold text-muted">模特名称</label>
                          <input
                            id="image-factory-model-name"
                            value={modelName}
                            onChange={(event) => setModelName(event.target.value)}
                            placeholder={defaultName}
                            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-ink outline-none transition focus:border-brand-300"
                          />
                          <button
                            type="button"
                            onClick={() => saveToModelLibrary(group.items)}
                            className="rounded-xl bg-brand-50 px-2.5 py-1.5 text-[11px] font-bold text-brand-600 hover:bg-brand-100"
                          >
                            整组存入模特库
                          </button>
                        </div>
                      )}
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        {group.items.map((item) => {
                          const saveState = modelSaveState[item.job.key];
                          return (
                            <div key={item.job.key} className="group">
                              <div className="relative overflow-hidden rounded-2xl border border-line bg-soft">
                                <div className="relative aspect-[4/5]">
                                  <Image src={item.result.imageDataUrl} alt={`${group.template.name}产出`} fill sizes="320px" className="object-cover" unoptimized />
                                </div>
                                <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                                  {isModelAsset && (
                                    <button
                                      type="button"
                                      disabled={Boolean(saveState)}
                                      onClick={() => saveToModelLibrary([item])}
                                      className={`rounded-xl p-2 text-white ${saveState === "saved" ? "bg-ok/80" : "bg-black/55"} disabled:cursor-default`}
                                      aria-label={saveState === "saved" ? "已存入模特库" : "存入模特库"}
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
                    </div>
                  );
                })}
              </div>
              {modelLibraryError && <Callout tone="danger" className="mt-3">{modelLibraryError}</Callout>}
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
          <Card flush>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold leading-tight text-ink">生成什么</h2>
                <p className="mt-0.5 text-[11px] text-faint">
                  {selectedTemplateIds.length > 0 ? `已选 ${selectedTemplateIds.length} 种，共 ${jobs.length} 张` : "可多选，一次排队跑完"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTemplate({
                  id: `custom-${Date.now().toString(36)}`,
                  name: "新模板",
                  category: "自建",
                  description: "",
                  prompt: "",
                  aspectRatio: "1:1",
                  slots: [{ id: "subject", label: "主体图", description: "", required: true }],
                })}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100"
                aria-label="新建产出类型"
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="border-b border-line px-4 py-3">
              <SegmentedControl
                options={categories.map((category) => ({ value: category, label: category }))}
                value={activeCategory}
                onChange={setActiveCategory}
                ariaLabel="产出分类"
              />
            </div>

            <div className="max-h-[26rem] space-y-2 overflow-auto p-3">
              {visibleTemplates.map((template) => (
                <TemplateRow
                  key={template.id}
                  template={template}
                  checked={selectedTemplateIds.includes(template.id)}
                  focused={focusTemplateId === template.id && selectedTemplates.length > 1}
                  onToggle={toggleTemplate}
                  onPreview={setPreviewTemplate}
                  onEdit={setEditingTemplate}
                  onDelete={deleteTemplate}
                />
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-ink">生成引擎</h2>
                <p className="mt-0.5 text-[11px] text-faint">使用已登录 CLI 的订阅额度</p>
              </div>
              <button type="button" onClick={() => refreshProviders(true)} disabled={isLoadingProviders} className="rounded-xl p-2 text-faint hover:bg-soft hover:text-ink" aria-label="刷新CLI状态">
                <RefreshCw size={15} className={isLoadingProviders ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              {providers.map((item) => <ProviderButton key={item.id} provider={item} selected={provider === item.id} onSelect={setProvider} />)}
              {isLoadingProviders && providers.length === 0 && (
                <div className="flex items-center gap-2 rounded-2xl bg-soft p-4 text-xs text-faint"><Loader2 size={14} className="animate-spin" />正在检查本机 CLI</div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {previewTemplate && <PreviewLightbox template={previewTemplate} onClose={() => setPreviewTemplate(null)} />}

      {pickingSlot && (
        <ModelLibraryPicker
          slotLabel={pickingSlot.label}
          models={modelAssets}
          loading={isLoadingModels}
          errorMessage={modelLibraryError}
          onPick={(entry) => pickModelAsset(pickingSlot, entry)}
          onDelete={removeModelAsset}
          onClose={() => setPickingSlot(null)}
        />
      )}

      {editingTemplate && (
        <TemplateEditor
          template={editingTemplate}
          categories={categories}
          onCancel={() => setEditingTemplate(null)}
          onSave={saveTemplate}
        />
      )}
    </div>
  );
}

const EDITOR_FIELD = "min-w-0 rounded-xl border border-line bg-surface px-2.5 py-2 text-xs text-ink";

function newRowId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 槽位 / 视图 / 场景三段结构一样，抽出来避免三份重复的增删壳子。 */
function EditorSection({
  title,
  hint,
  addLabel,
  onAdd,
  empty,
  children,
}: {
  title: string;
  hint: string;
  addLabel: string;
  onAdd: () => void;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold text-muted">
          {title}
          <span className="ml-2 font-normal text-faint">{hint}</span>
        </h3>
        <button type="button" onClick={onAdd} className="shrink-0 text-xs font-bold text-brand-600">{addLabel}</button>
      </div>
      <div className="mt-2 space-y-2">
        {empty ? <p className="rounded-2xl bg-soft px-3 py-2.5 text-[11px] text-faint">还没有条目，可以不填</p> : children}
      </div>
    </div>
  );
}

function EditorRow({
  cols,
  label,
  onRemove,
  children,
}: {
  cols: string;
  label: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-soft p-2">
      <div className={`grid min-w-0 flex-1 gap-2 ${cols}`}>{children}</div>
      <button type="button" onClick={onRemove} className="shrink-0 rounded-xl p-2 text-faint hover:text-danger" aria-label={`删除${label}`}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function TemplateEditor({
  template,
  categories,
  onCancel,
  onSave,
}: {
  template: ImageFactoryTemplate;
  categories: string[];
  onCancel: () => void;
  onSave: (template: ImageFactoryTemplate) => void;
}) {
  const [draft, setDraft] = useState(template);
  const views = draft.views || [];
  const presets = draft.scenePresets || [];

  const patch = (next: Partial<ImageFactoryTemplate>) => setDraft((current) => ({ ...current, ...next }));
  const replaceAt = <T,>(list: T[], index: number, next: Partial<T>): T[] =>
    list.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));

  // 空列表存成 undefined，和内置模板「不填即没有」的形态保持一致
  const submit = () => onSave({
    ...draft,
    views: views.length > 0 ? views : undefined,
    scenePresets: presets.length > 0 ? presets : undefined,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="编辑图片模板">
      <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-3xl bg-surface p-5 shadow-pop">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">自建模板</h2>
          <button type="button" onClick={onCancel} className="rounded-xl p-2 text-faint hover:bg-soft hover:text-ink" aria-label="关闭"><X size={17} /></button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-muted">模板名称 *<input value={draft.name} onChange={(event) => patch({ name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink" /></label>
          <label className="text-xs font-bold text-muted">
            所属分类
            <input
              value={draft.category}
              onChange={(event) => patch({ category: event.target.value })}
              list="image-factory-categories"
              className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink"
            />
            <datalist id="image-factory-categories">
              {categories.map((category) => <option key={category} value={category} />)}
            </datalist>
          </label>
          <label className="text-xs font-bold text-muted">输出比例<input value={draft.aspectRatio} onChange={(event) => patch({ aspectRatio: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink" /></label>
          <label className="text-xs font-bold text-muted">
            卡片示意图
            <select
              value={draft.thumb || ""}
              onChange={(event) => patch({ thumb: event.target.value ? (event.target.value as ImageTemplateThumb) : undefined })}
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink"
            >
              <option value="">通用图标</option>
              {IMAGE_TEMPLATE_THUMB_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-muted sm:col-span-2">用途说明<input value={draft.description} onChange={(event) => patch({ description: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink" /></label>
          <label className="text-xs font-bold text-muted sm:col-span-2">
            生成规则 *
            <span className="ml-2 font-normal text-faint">写清楚：保持什么 / 默认什么 / 禁止什么</span>
            <textarea value={draft.prompt} onChange={(event) => patch({ prompt: event.target.value })} rows={5} className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm leading-6 text-ink" />
          </label>
        </div>

        <EditorSection
          title="上传槽位"
          hint="勾选即必传"
          addLabel="+ 添加槽位"
          empty={draft.slots.length === 0}
          onAdd={() => patch({ slots: [...draft.slots, { id: newRowId("slot"), label: "参考图", description: "", required: true }] })}
        >
          {draft.slots.map((slot, index) => (
            <EditorRow
              key={slot.id}
              cols="grid-cols-[1fr_1.6fr_auto]"
              label={slot.label}
              onRemove={() => patch({ slots: draft.slots.filter((_, slotIndex) => slotIndex !== index) })}
            >
              <input value={slot.label} onChange={(event) => patch({ slots: replaceAt(draft.slots, index, { label: event.target.value }) })} placeholder="槽位名称" className={EDITOR_FIELD} />
              <input value={slot.description} onChange={(event) => patch({ slots: replaceAt(draft.slots, index, { description: event.target.value }) })} placeholder="图片用途" className={EDITOR_FIELD} />
              <label className="flex shrink-0 items-center gap-1.5 px-1 text-[11px] font-bold text-muted">
                <input type="checkbox" checked={slot.required} onChange={(event) => patch({ slots: replaceAt(draft.slots, index, { required: event.target.checked }) })} className="h-3.5 w-3.5 accent-brand-500" />
                必传
              </label>
            </EditorRow>
          ))}
        </EditorSection>

        <EditorSection
          title="输出视图"
          hint="填了就一次出多张，逐张生成"
          addLabel="+ 添加视图"
          empty={views.length === 0}
          onAdd={() => patch({ views: [...views, { id: newRowId("view"), label: "新视角", hint: "" }] })}
        >
          {views.map((view, index) => (
            <EditorRow
              key={view.id}
              cols="grid-cols-[1fr_1.6fr]"
              label={view.label}
              onRemove={() => patch({ views: views.filter((_, viewIndex) => viewIndex !== index) })}
            >
              <input value={view.label} onChange={(event) => patch({ views: replaceAt(views, index, { label: event.target.value }) })} placeholder="视角名称" className={EDITOR_FIELD} />
              <input value={view.hint} onChange={(event) => patch({ views: replaceAt(views, index, { hint: event.target.value }) })} placeholder="这个视角要拍成什么样" className={EDITOR_FIELD} />
            </EditorRow>
          ))}
        </EditorSection>

        <EditorSection
          title="画面场景"
          hint="点选后写进补充要求，只写场景不写商品"
          addLabel="+ 添加场景"
          empty={presets.length === 0}
          onAdd={() => patch({ scenePresets: [...presets, { id: newRowId("scene"), label: "新场景", prompt: "" }] })}
        >
          {presets.map((preset, index) => (
            <EditorRow
              key={preset.id}
              cols="grid-cols-[1fr_1.6fr]"
              label={preset.label}
              onRemove={() => patch({ scenePresets: presets.filter((_, presetIndex) => presetIndex !== index) })}
            >
              <input value={preset.label} onChange={(event) => patch({ scenePresets: replaceAt(presets, index, { label: event.target.value }) })} placeholder="标签名" className={EDITOR_FIELD} />
              <input value={preset.prompt} onChange={(event) => patch({ scenePresets: replaceAt(presets, index, { prompt: event.target.value }) })} placeholder="30-60 字的画面描述" className={EDITOR_FIELD} />
            </EditorRow>
          ))}
        </EditorSection>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button variant="primary" disabled={!draft.name.trim() || !draft.prompt.trim()} onClick={submit}>保存模板</Button>
        </div>
      </div>
    </div>
  );
}
