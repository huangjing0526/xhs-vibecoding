"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus, Scissors, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import CanvasPage from "@/components/workflow/CanvasPage";
import TemplateEditor from "@/components/workflow/ImageTemplateEditor";
import TemplatePreview from "@/components/workflow/TemplatePreview";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { Input } from "@/components/ui/Field";
import EmptyState from "@/components/ui/EmptyState";
import { AREAS, toolSections, type AreaId } from "@/lib/capabilities";
import { groupInOrder } from "@/lib/collections";
import {
  imageTemplateCategories,
  loadCustomImageTemplates,
  newCustomImageTemplate,
  saveCustomImageTemplate,
  type ImageFactoryTemplate,
  type ImageTemplateThumb,
} from "@/lib/imageFactory";
import {
  imageTemplateCards,
  rhythmTemplateCards,
  type TemplateBar,
  type TemplateCard,
} from "@/lib/templates";
import { SHOT_TONE_BAR } from "@/lib/videoFactory";
import type { RecentEntry, RecentKind } from "@/lib/recentUsed";

/**
 * 目录页：工具目录与模板目录共用一套版式——搜索、最近使用、分类锚点、分区大卡。
 * 两者真正的差别只有「卡片里画什么、点了去哪、右上角有什么动作」，所以版式只写一遍（Catalog），
 * 两种形态各自是一层薄壳，各管各的数据。从前用一个 kind 分支贯穿整页，
 * 结果是模板那半边的状态和弹窗在工具页也照样存在，只是从不生效。
 */

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: LucideIcon;
  tint: string;
  /** 模板跑出来的真实样例；没有就退回示意图。 */
  preview?: string;
  thumb?: ImageTemplateThumb;
  /** 复刻这张模板要你补的自有素材。 */
  slots?: string[];
  /** 没有样例图的模板（视频结构）用一条节奏条代替。 */
  bars?: TemplateBar[];
  /** 悬停时露出的动作文案，如「照这个做 →」；不填就不露。 */
  cta?: string;
  onOpen: () => void;
}

/** 节奏条：每一镜一根，高度是时长占比，颜色是快慢。只有时间码，原视频的画面与音频一概不进这里。 */
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

/** 一张目录卡：上面一块示意图，左下角压一个小图标，下面是名字与说明。 */
function CatalogCard({ item }: { item: CatalogItem }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={item.onOpen}
      className="group overflow-hidden rounded-3xl border border-line bg-surface text-left transition-all duration-150 hover:border-brand-300 hover:shadow-raised"
    >
      <div className={`relative aspect-[4/3] bg-gradient-to-br to-surface ${item.tint}`}>
        {item.bars?.length ? (
          <RhythmBars bars={item.bars} />
        ) : item.preview || item.thumb ? (
          <TemplatePreview template={item} sizes="260px" />
        ) : (
          <span className="flex h-full items-center justify-center text-brand-500/70">
            <Icon size={44} strokeWidth={1.4} aria-hidden="true" />
          </span>
        )}
        <span className="absolute bottom-0 left-3 flex h-9 w-9 translate-y-1/2 items-center justify-center rounded-xl border border-line bg-surface text-brand-500 shadow-card">
          <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
        </span>
      </div>
      <div className="px-3.5 pb-3.5 pt-7">
        <div className="truncate text-[14px] font-bold text-ink">{item.name}</div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-faint">{item.description}</p>
        {/* 复刻前最该知道的是「我得先有什么」，所以槽位摆在卡片上，不等点进去才说 */}
        {item.slots && item.slots.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-bold text-faint">要你补</span>
            {item.slots.map((slot) => (
              <Badge key={slot}>{slot}</Badge>
            ))}
          </div>
        )}
        {item.cta && (
          <span className="mt-2 block text-[11px] font-bold text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
            {item.cta}
          </span>
        )}
      </div>
    </button>
  );
}

/** 目录版式本身：不关心装的是工具还是模板，只管搜、分区、锚点、最近使用。 */
function Catalog({
  area,
  items,
  recent,
  recentKind,
  searchPlaceholder,
  action,
  children,
}: {
  area: AreaId;
  items: CatalogItem[];
  recent: RecentEntry[];
  recentKind: RecentKind;
  searchPlaceholder: string;
  /** 搜索框右边的动作按钮 */
  action?: ReactNode;
  /** 挂在页面上的弹层，如模板编辑器 */
  children?: ReactNode;
}) {
  const [keyword, setKeyword] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const visible = useMemo(() => {
    const trimmed = keyword.trim().toLowerCase();
    if (!trimmed) return items;
    return items.filter((item) =>
      `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(trimmed)
    );
  }, [items, keyword]);

  const sections = useMemo(() => groupInOrder(visible, (item) => item.category), [visible]);

  const recentItems = useMemo(
    () =>
      recent
        .filter((entry) => entry.kind === recentKind)
        .map((entry) => items.find((item) => item.id === entry.id))
        .filter((item): item is CatalogItem => Boolean(item)),
    [items, recent, recentKind]
  );

  // 分类 tab 跟着滚动走：滚到哪个分区就高亮哪个，不用手动同步
  useEffect(() => {
    const nodes = sections
      .map((section) => sectionRefs.current[section.key])
      .filter((node): node is HTMLElement => Boolean(node));
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((entry) => entry.isIntersecting).sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
        )[0];
        if (hit) setActiveCategory(hit.target.getAttribute("data-category") || "");
      },
      { rootMargin: "-72px 0px -60% 0px", threshold: 0 }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections]);

  const meta = AREAS[area];

  return (
    <CanvasPage
      title={meta.label}
      subtitle={meta.subtitle}
      action={
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={searchPlaceholder}
              className="bg-surface pl-9"
            />
          </div>
          {action}
        </div>
      }
    >
      {recentItems.length > 0 && !keyword.trim() && (
        <section className="mt-6">
          <h2 className="mb-2.5 text-[13px] font-bold text-muted">最近使用</h2>
          <div className="flex flex-wrap gap-2">
            {recentItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onOpen}
                  className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2.5 transition-colors hover:border-brand-300"
                >
                  <Icon size={16} strokeWidth={1.9} className="text-brand-500" aria-hidden="true" />
                  <span className="text-[13px] font-bold text-ink">{item.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {sections.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Search size={22} />}
            title={keyword.trim() ? `没有匹配「${keyword.trim()}」的结果` : "这里还是空的"}
          />
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-5 mt-6 flex gap-4 overflow-x-auto bg-canvas px-5 pb-2 pt-2">
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() =>
                  sectionRefs.current[section.key]?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                aria-current={activeCategory === section.key ? "true" : undefined}
                className={`relative shrink-0 pb-1 text-[15px] font-bold tracking-tight transition-colors ${
                  activeCategory === section.key ? "text-ink" : "text-faint hover:text-muted"
                }`}
              >
                {section.key}
                {activeCategory === section.key && (
                  <span className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-ink" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>

          {sections.map((section) => (
            <section
              key={section.key}
              data-category={section.key}
              ref={(node) => {
                sectionRefs.current[section.key] = node;
              }}
              className="scroll-mt-14 pt-5"
            >
              <h2 className="mb-3 text-[13px] font-bold text-muted">{section.key}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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

/** 工具目录：全部动词能力，按用途分区。名词库不在这里——它们在侧栏下段。 */
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

/** 模板目录：全站唯一的模板入口，出图模板与拆来的视频结构并在一处。 */
export function TemplateGallery({
  recent,
  onOpenArea,
  onOpenTemplate,
}: {
  recent: RecentEntry[];
  onOpenArea: (id: AreaId) => void;
  onOpenTemplate: (card: TemplateCard) => void;
}) {
  const [imageCards, setImageCards] = useState<TemplateCard[]>([]);
  const [rhythmCards, setRhythmCards] = useState<TemplateCard[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<ImageFactoryTemplate | null>(null);
  const [customTemplates, setCustomTemplates] = useState<ImageFactoryTemplate[]>([]);
  const [saveError, setSaveError] = useState("");

  // 自建模板存在本机浏览器里，只能挂载后读
  useEffect(() => {
    setImageCards(imageTemplateCards());
    setCustomTemplates(loadCustomImageTemplates());
  }, []);

  // 拆来的视频结构存在本机磁盘上，读回来并到同一份目录里
  useEffect(() => {
    let ignore = false;
    rhythmTemplateCards()
      .then((loaded) => {
        if (!ignore) setRhythmCards(loaded);
      })
      .catch((error) => {
        // 一次失败的读取不该把上一次读到的清空，所以这里只记不改
        console.error("[TemplateGallery] 视频结构模板读取失败", { action: "templates.rhythms.list", error });
      });
    return () => {
      ignore = true;
    };
  }, []);

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

  const items = useMemo<CatalogItem[]>(
    () =>
      [...imageCards, ...rhythmCards].map((card) => ({
        id: card.id,
        name: card.name,
        description: card.description,
        category: card.category,
        icon: card.kind === "rhythm" ? AREAS.videoFactory.icon : AREAS.images.icon,
        tint: card.kind === "rhythm" ? AREAS.videoFactory.tint : AREAS.images.tint,
        preview: card.kind === "image" ? card.preview : undefined,
        thumb: card.kind === "image" ? card.thumb : undefined,
        bars: card.kind === "rhythm" ? card.bars : undefined,
        slots: card.slots,
        cta: "照这个做 →",
        onOpen: () => onOpenTemplate(card),
      })),
    [imageCards, rhythmCards, onOpenTemplate]
  );

  return (
    <Catalog
      area="templates"
      items={items}
      recent={recent}
      recentKind="template"
      searchPlaceholder="搜模板名或用途"
      action={
        // 模板的两条来源：自己建一个，或去拆一条真实的对标沉淀成模板
        <>
          <Button size="sm" variant="secondary" onClick={() => onOpenArea("extract")} icon={<Scissors size={14} />}>
            拆一条
          </Button>
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
