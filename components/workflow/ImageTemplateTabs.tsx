"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import TemplateThumb from "@/components/workflow/TemplateThumb";
import { groupInOrder } from "@/lib/collections";
import type { ImageFactoryTemplate } from "@/lib/imageFactory";

/**
 * 产出类型选择条。
 * 做成一排看得见的图卡而不是下拉或分类标签，是为了让人一眼看完「这里能做哪些图」——
 * 分类只降级成分组小标题，不再是要先点开的一层。
 */
export default function ImageTemplateTabs({
  templates,
  activeId,
  batchIds,
  onSelect,
}: {
  templates: ImageFactoryTemplate[];
  activeId: string;
  /** 已加入本次批次的产出，在卡片上打个角标，切走了也知道它还排着队 */
  batchIds: string[];
  onSelect: (templateId: string) => void;
}) {
  const groups = groupInOrder(templates, (template) => template.category);

  return (
    <div className="-mx-1 flex gap-5 overflow-x-auto px-1 pb-2">
      {groups.map((group) => (
        <div key={group.key} className="shrink-0">
          <p className="mb-1.5 px-0.5 text-[10px] font-bold tracking-wide text-faint">{group.key}</p>
          <div className="flex gap-2">
            {group.items.map((template) => {
              const active = template.id === activeId;
              const queued = batchIds.includes(template.id) && !active;
              return (
                <button
                  key={template.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelect(template.id)}
                  title={template.description}
                  className={`w-[5.5rem] shrink-0 overflow-hidden rounded-2xl border text-left transition-colors ${
                    active
                      ? "border-brand-400 bg-brand-50 ring-2 ring-brand-100"
                      : "border-line bg-surface hover:border-brand-300"
                  }`}
                >
                  <div className="relative aspect-[4/3] border-b border-line bg-soft">
                    {template.preview ? (
                      <Image src={template.preview} alt="" fill sizes="88px" className="object-cover" unoptimized />
                    ) : (
                      <TemplateThumb thumb={template.thumb} active={active} />
                    )}
                    {queued && (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-white">
                        <Check size={10} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className={`truncate px-1.5 py-1.5 text-[11px] font-bold ${active ? "text-brand-700" : "text-muted"}`}>
                    {template.name}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
