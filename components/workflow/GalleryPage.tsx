"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import CanvasPage from "@/components/workflow/CanvasPage";
import TemplatePreview from "@/components/workflow/TemplatePreview";
import { Input } from "@/components/ui/Field";
import EmptyState from "@/components/ui/EmptyState";
import { AREAS, toolSections, type AreaId } from "@/lib/capabilities";
import { groupInOrder } from "@/lib/collections";
import {
  BUILT_IN_IMAGE_TEMPLATES,
  loadCustomImageTemplates,
  type ImageFactoryTemplate,
  type ImageTemplateThumb,
} from "@/lib/imageFactory";
import type { RecentEntry } from "@/lib/recentUsed";

/**
 * 目录页：工具与模板共用一套版式——搜索、最近使用、分类锚点、分区大卡。
 * 两者的差别只有「卡片里画什么」和「点了去哪」，其余全同，所以只写一遍。
 */

/** 目录页的两种形态，取值即它自己的区 id——页头文案直接从能力目录取，不再映射一次。 */
export type GalleryKind = Extract<AreaId, "tools" | "templates">;

interface GalleryItem {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: LucideIcon;
  tint: string;
  /** 模板跑出来的真实样例；没有就退回示意图。 */
  preview?: string;
  thumb?: ImageTemplateThumb;
  onOpen: () => void;
}

const SEARCH_PLACEHOLDER: Record<GalleryKind, string> = {
  tools: "搜工具名或用途",
  templates: "搜模板名或用途",
};

function toolItems(onOpenArea: (id: AreaId) => void): GalleryItem[] {
  return toolSections().flatMap(({ category, items }) =>
    items.map((id) => {
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
  );
}

function templateItems(
  templates: ImageFactoryTemplate[],
  onOpenTemplate: (templateId: string) => void
): GalleryItem[] {
  const icon = AREAS.images.icon;
  return groupInOrder(templates, (template) => template.category).flatMap((group) =>
    group.items.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      category: group.key,
      icon,
      tint: AREAS.images.tint,
      preview: template.preview,
      thumb: template.thumb,
      onOpen: () => onOpenTemplate(template.id),
    }))
  );
}

/** 一张目录卡：上面一块示意图，左下角压一个小图标，下面是名字与说明。 */
function GalleryCard({ item, kind }: { item: GalleryItem; kind: GalleryKind }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={item.onOpen}
      className="group overflow-hidden rounded-3xl border border-line bg-surface text-left transition-all duration-150 hover:border-brand-300 hover:shadow-raised"
    >
      <div className={`relative aspect-[4/3] bg-gradient-to-br to-surface ${item.tint}`}>
        {kind === "templates" ? (
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
      </div>
    </button>
  );
}

export default function GalleryPage({
  kind,
  recent,
  onOpenArea,
  onOpenTemplate,
}: {
  kind: GalleryKind;
  recent: RecentEntry[];
  onOpenArea: (id: AreaId) => void;
  onOpenTemplate: (templateId: string) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [customTemplates, setCustomTemplates] = useState<ImageFactoryTemplate[]>([]);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // 自建模板存在本机浏览器里，只能挂载后读
  useEffect(() => {
    if (kind === "templates") setCustomTemplates(loadCustomImageTemplates());
  }, [kind]);

  const items = useMemo(
    () =>
      kind === "tools"
        ? toolItems(onOpenArea)
        : templateItems([...BUILT_IN_IMAGE_TEMPLATES, ...customTemplates], onOpenTemplate),
    [kind, customTemplates, onOpenArea, onOpenTemplate]
  );

  const visible = useMemo(() => {
    const trimmed = keyword.trim().toLowerCase();
    if (!trimmed) return items;
    return items.filter((item) =>
      `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(trimmed)
    );
  }, [items, keyword]);

  const sections = useMemo(() => groupInOrder(visible, (item) => item.category), [visible]);

  const recentItems = useMemo(() => {
    const wanted = kind === "tools" ? "area" : "template";
    return recent
      .filter((entry) => entry.kind === wanted)
      .map((entry) => items.find((item) => item.id === entry.id))
      .filter((item): item is GalleryItem => Boolean(item));
  }, [items, kind, recent]);

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

  const meta = AREAS[kind];

  return (
    <CanvasPage
      title={meta.label}
      subtitle={meta.subtitle}
      action={
        <div className="relative w-full sm:w-72">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={SEARCH_PLACEHOLDER[kind]}
            className="bg-surface pl-9"
          />
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
          <EmptyState icon={<Search size={22} />} title={`没有匹配「${keyword.trim()}」的结果`} />
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
                  <GalleryCard key={item.id} item={item} kind={kind} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </CanvasPage>
  );
}
