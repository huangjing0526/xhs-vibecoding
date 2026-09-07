"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import CanvasPage from "@/components/workflow/CanvasPage";
import TemplateEditor from "@/components/workflow/ImageTemplateEditor";
import TemplatePreview from "@/components/workflow/TemplatePreview";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { Input } from "@/components/ui/Field";
import EmptyState from "@/components/ui/EmptyState";
import { AREAS, TOOL_AREAS, toolSections, type AreaId } from "@/lib/capabilities";
import { groupInOrder } from "@/lib/collections";
import {
  deleteCustomImageTemplate,
  imageTemplateCategories,
  loadCustomImageTemplates,
  newCustomImageTemplate,
  saveCustomImageTemplate,
  type ImageFactoryTemplate,
  type ImageTemplateThumb,
} from "@/lib/imageFactory";
import {
  daokuTemplateCards,
  imageTemplateCards,
  rhythmTemplateCards,
  templateOrigin,
  type TemplateBar,
  type TemplateCard,
} from "@/lib/templates";
import {
  deleteBenchmarkRhythm,
  deleteDaokuTemplate,
} from "@/lib/workflowClient";
import { SHOT_TONE_BAR } from "@/lib/videoFactory";
import type { RecentEntry, RecentKind } from "@/lib/recentUsed";

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: LucideIcon;
  tint: string;
  preview?: string;
  thumb?: ImageTemplateThumb;
  slots?: string[];
  bars?: TemplateBar[];
  lines?: string[];
  cta?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpen: () => void;
}

function RhythmBars({ bars }: { bars: TemplateBar[] }) {
  return (
    <div className="flex h-full items-end gap-[2px] px-3 pb-3 pt-6">
      {bars.map((bar, index) => (
        <span
          key={index}
          style={{ height: `${bar.height}%` }}
          className={`min-w-[3px] flex-1 rounded-t-sm ${SHOT_TONE_BAR[bar.tone]}`}
        />
      ))}
    </div>
  );
}

function DaoLines({ lines }: { lines: string[] }) {
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 px-4 py-3">
      {lines.map((line) => (
        <p key={line} className="line-clamp-1 text-[11px] font-bold leading-5 text-brand-600/80">
          「{line}」
        </p>
      ))}
    </div>
  );
}

function CatalogCard({ item }: { item: CatalogItem }) {
  const Icon = item.icon;
  const manageable = Boolean(item.onEdit || item.onDelete);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-3xl border border-line bg-surface text-left shadow-card transition-all duration-150 hover:border-brand-300 hover:shadow-lg">
      <div className="relative aspect-[4/3] overflow-hidden bg-soft">
        <button
          type="button"
          onClick={item.onOpen}
          className="absolute inset-0 z-0 flex flex-col justify-between p-3.5"
          aria-label={`打开${item.name}`}
        >
            {item.bars?.length ? (
              <RhythmBars bars={item.bars} />
            ) : item.lines?.length ? (
              <DaoLines lines={item.lines} />
            ) : item.preview || item.thumb ? (
              <TemplatePreview template={item} sizes="260px" />
            ) : (
              <div className={`h-full w-full bg-gradient-to-br ${item.tint} to-transparent opacity-80`} />
            )}
          <span className="relative z-10 self-start rounded-xl border border-line bg-surface/90 p-2 shadow-sm backdrop-blur-sm">
            <Icon size={16} strokeWidth={2.2} className="text-ink" aria-hidden="true" />
          </span>
          {item.cta && (
            <span className="relative z-10 self-end rounded-xl bg-ink/90 px-3 py-1.5 text-xs font-bold text-white opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100">
              {item.cta}
            </span>
          )}
        </button>

        {manageable && (
          <div className="pointer-events-none absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
            {item.onEdit && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  item.onEdit?.();
                }}
                className="rounded-lg border border-line bg-surface/95 p-1.5 text-muted shadow-sm backdrop-blur-sm transition-colors hover:border-brand-300 hover:text-ink"
                aria-label={`编辑${item.name}`}
              >
                <Pencil size={13} strokeWidth={2.2} />
              </button>
            )}
            {item.onDelete && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  item.onDelete?.();
                }}
                className="rounded-lg border border-line bg-surface/95 p-1.5 text-muted shadow-sm backdrop-blur-sm transition-colors hover:border-danger hover:text-danger"
                aria-label={`删除${item.name}`}
              >
                <Trash2 size={13} strokeWidth={2.2} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-1 text-[15px] font-bold text-ink">{item.name}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{item.description}</p>
        {item.slots && item.slots.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {item.slots.map((slot) => (
              <span key={slot} className="rounded-md bg-soft px-1.5 py-0.5 text-[10px] font-bold text-faint">
                {slot}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Catalog({
  area,
  items,
  recent,
  recentKind,
  searchPlaceholder,
  action,
  children,
}: {
  area: "tools" | "templates";
  items: CatalogItem[];
  recent: RecentEntry[];
  recentKind: RecentKind;
  searchPlaceholder: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const [keyword, setKeyword] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) => item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
    );
  }, [items, keyword]);

  const sections = useMemo(
    () =>
      groupInOrder(filtered, (item) => item.category).map((group) => ({
        key: group.key,
        items: group.items,
      })),
    [filtered]
  );

  useEffect(() => {
    if (sections.length > 0 && !activeCategory) {
      setActiveCategory(sections[0].key);
    }
  }, [sections, activeCategory]);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const recentItems = useMemo(
    () =>
      recent
        .filter((entry) => entry.kind === recentKind)
        .map((entry) => itemMap.get(entry.id))
        .filter((item): item is CatalogItem => Boolean(item)),
    [recent, recentKind, itemMap]
  );

  return (
    <CanvasPage
      title={AREAS[area].label}
      subtitle={AREAS[area].subtitle}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56 sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={searchPlaceholder}
              className="bg-surface pl-9 text-xs"
            />
          </div>
          {action}
        </div>
      }
    >
      {recentItems.length > 0 && !keyword.trim() && (
        <section className="mb-8">
          <h2 className="mb-3 text-[13px] font-bold text-muted">最近使用</h2>
          <div className="flex flex-wrap gap-2">
            {recentItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onOpen}
                  className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 transition-colors hover:border-brand-300"
                >
                  <Icon size={14} className="text-brand-500" />
                  <span className="text-xs font-bold text-ink">{item.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {sections.length === 0 ? (
        <EmptyState
          icon={<Search size={22} />}
          title={keyword.trim() ? `没有匹配「${keyword.trim()}」的结果` : "这里还是空的"}
        />
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-5 mb-6 flex gap-6 overflow-x-auto bg-canvas px-5 pb-2 pt-2">
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() =>
                  sectionRefs.current[section.key]?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className={`shrink-0 text-sm font-bold transition-colors ${
                  activeCategory === section.key ? "text-ink" : "text-faint hover:text-muted"
                }`}
              >
                {section.key}
              </button>
            ))}
          </div>

          {sections.map((section) => (
            <section
              key={section.key}
              ref={(node) => {
                sectionRefs.current[section.key] = node;
              }}
              className="mb-10 scroll-mt-20"
            >
              <h2 className="mb-4 text-[13px] font-bold text-muted">{section.key}</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {section.items.map((item) => (
                  <CatalogCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {children}
    </CanvasPage>
  );
}

export function ToolsGallery({
  recent,
  onOpenArea,
}: {
  recent: RecentEntry[];
  onOpenArea: (id: AreaId) => void;
}) {
  const items = useMemo<CatalogItem[]>(
    () =>
      toolSections().flatMap(({ category, items: areaIds }) =>
        areaIds.map((id) => {
          const meta = AREAS[id];
          return {
            id,
            name: meta.label,
            description: meta.subtitle,
            category,
            icon: meta.icon,
            tint: meta.tint,
            cta: "打开 →",
            onOpen: () => onOpenArea(id),
          };
        })
      ),
    [onOpenArea]
  );

  return (
    <Catalog
      area="tools"
      items={items}
      recent={recent}
      recentKind="area"
      searchPlaceholder="搜工具名或用途"
    />
  );
}

export function TemplateGallery({
  recent,
  onOpenTemplate,
  onOpenArea,
}: {
  recent: RecentEntry[];
  onOpenTemplate: (card: TemplateCard) => void;
  onOpenArea: (id: AreaId) => void;
}) {
  const [imageCards, setImageCards] = useState<TemplateCard[]>([]);
  const [diskCards, setDiskCards] = useState<TemplateCard[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<ImageFactoryTemplate | null>(null);
  const [customTemplates, setCustomTemplates] = useState<ImageFactoryTemplate[]>([]);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setImageCards(imageTemplateCards());
    setCustomTemplates(loadCustomImageTemplates());
  }, []);

  const loadDiskCards = useCallback(async () => {
    try {
      const results = await Promise.allSettled<TemplateCard[]>([rhythmTemplateCards(), daokuTemplateCards()]);
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[TemplateGallery] 磁盘模板读取失败", {
            action: "templates.disk.list",
            error: result.reason,
          });
        }
      }
      const loaded = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
      setDiskCards(loaded);
    } catch (error) {
      console.error("[TemplateGallery] 磁盘模板读取异常", { error });
    }
  }, []);

  useEffect(() => {
    loadDiskCards();
  }, [loadDiskCards]);

  const handleSaveTemplate = useCallback((template: ImageFactoryTemplate) => {
    try {
      const nextCustom = saveCustomImageTemplate(template);
      setCustomTemplates(nextCustom);
      setImageCards(imageTemplateCards());
      setEditingTemplate(null);
      setSaveError("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "模板没能存进本机，换个浏览器或清点空间再试");
    }
  }, []);

  const handleDeleteTemplate = useCallback((template: ImageFactoryTemplate) => {
    if (!window.confirm(`确认删除自建模板「${template.name}」吗？`)) return;
    try {
      setCustomTemplates(deleteCustomImageTemplate(template.id));
      setImageCards(imageTemplateCards());
      setSaveError("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "模板没能从本机删掉");
    }
  }, []);

  const handleDeleteDiskTemplate = useCallback(
    async (card: TemplateCard) => {
      const label = card.kind === "daoku" ? "道库模板" : "视频结构模板";
      if (!window.confirm(`确认删除${label}「${card.name}」吗？`)) return;
      try {
        if (card.kind === "daoku") {
          await deleteDaokuTemplate(card.id);
        } else if (card.kind === "rhythm") {
          await deleteBenchmarkRhythm(card.id);
        }
        await loadDiskCards();
        setSaveError("");
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "模板没能从磁盘删掉");
      }
    },
    [loadDiskCards]
  );

  const items = useMemo<CatalogItem[]>(
    () =>
      [...imageCards, ...diskCards].map((card) => ({
        id: card.id,
        name: card.name,
        description: card.description,
        category: card.category,
        icon: AREAS[templateOrigin(card)].icon,
        tint: AREAS[templateOrigin(card)].tint,
        preview: card.kind === "image" ? card.preview : undefined,
        thumb: card.kind === "image" ? card.thumb : undefined,
        bars: card.kind === "rhythm" ? card.bars : undefined,
        lines: card.kind === "daoku" ? card.lines : undefined,
        slots: card.slots,
        onEdit: card.kind === "image" && !card.template.builtIn ? () => setEditingTemplate(card.template) : undefined,
        onDelete:
          card.kind === "image"
            ? !card.template.builtIn
              ? () => handleDeleteTemplate(card.template)
              : undefined
            : () => handleDeleteDiskTemplate(card),
        cta: "照这个做 →",
        onOpen: () => onOpenTemplate(card),
      })),
    [imageCards, diskCards, onOpenTemplate, handleDeleteTemplate, handleDeleteDiskTemplate]
  );

  return (
    <Catalog
      area="templates"
      items={items}
      recent={recent}
      recentKind="template"
      searchPlaceholder="搜模板名或用途"
      action={
        // 模板的来源：自己建一个，或用「沉淀模板」区的工具去拆——该分区的成员在这里自动长出入口，
        // 图标与动词都取自 AREAS（动词是 hint 的第一段，约定见 lib/capabilities 的 ToolCategory 注释）
        <>
          {TOOL_AREAS.filter((id) => AREAS[id].category === "沉淀模板").map((id) => {
            const meta = AREAS[id];
            const Icon = meta.icon;
            return (
              <Button key={id} size="sm" variant="secondary" onClick={() => onOpenArea(id)} icon={<Icon size={14} />}>
                {meta.hint.split(" · ")[0]}
              </Button>
            );
          })}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setEditingTemplate(newCustomImageTemplate())}
            icon={<Plus size={14} />}
          >
            新建模板
          </Button>
        </>
      }
    >
      {saveError && (
        <div className="mt-4">
          <Callout tone="danger">{saveError}</Callout>
        </div>
      )}
      {editingTemplate && (
        <TemplateEditor
          template={editingTemplate}
          categories={imageTemplateCategories(customTemplates)}
          onCancel={() => setEditingTemplate(null)}
          onSave={handleSaveTemplate}
        />
      )}
    </Catalog>
  );
}
