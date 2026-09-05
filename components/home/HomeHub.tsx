"use client";

import { ArrowRight, ChevronRight } from "lucide-react";
import PromptHero from "@/components/home/PromptHero";
import TemplatePreview from "@/components/workflow/TemplatePreview";
import { toImageTemplateCard, type TemplateCard } from "@/lib/templates";
import {
  AREAS,
  HOME_FEATURED,
  HOME_SCENES,
  HOME_TOOL_AREAS,
  type AreaId,
} from "@/lib/capabilities";
import { BUILT_IN_IMAGE_TEMPLATES } from "@/lib/imageFactory";
import type { RecentEntry } from "@/lib/recentUsed";

/** 首页只摆一排模板做引子，看全的路在「模板」页。 */
const PREVIEW_TEMPLATES = BUILT_IN_IMAGE_TEMPLATES.slice(0, 6);

/** 分区标题；moreLabel/onMore 渲染右侧的「查看全部」链接——两处调用共用同一颗，不各写一份。 */
function SectionTitle({ title, moreLabel, onMore }: { title: string; moreLabel?: string; onMore?: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-bold tracking-tight text-ink">{title}</h2>
      {moreLabel && onMore && (
        <button
          type="button"
          onClick={onMore}
          className="flex items-center gap-0.5 text-xs font-bold text-muted transition-colors hover:text-ink"
        >
          {moreLabel}
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

/** 一张区入口卡：图标 + 名字 + 一句说明。场景卡与小工具卡是同一件东西，只写一次。 */
function AreaTile({ id, onOpen }: { id: AreaId; onOpen: (id: AreaId) => void }) {
  const meta = AREAS[id];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 text-left transition-all duration-150 hover:border-brand-300 hover:shadow-card"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br to-surface ${meta.tint}`}>
        <Icon size={17} strokeWidth={1.9} className="text-brand-500" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-ink">{meta.label}</span>
        <span className="block truncate text-[11px] font-medium text-faint">{meta.hint}</span>
      </span>
    </button>
  );
}

export default function HomeHub({
  onOpenArea,
  onOpenTemplate,
  onSubmitIntent,
  onPickExample,
  intentPending,
  recent,
}: {
  onOpenArea: (id: AreaId) => void;
  onOpenTemplate: (card: TemplateCard) => void;
  onSubmitIntent: (text: string) => void;
  onPickExample: (text: string) => void;
  intentPending: boolean;
  recent: RecentEntry[];
}) {
  // 「最近在做」是快捷回位，不受「一个区最多露一次」约束——和工具目录的最近使用同一先例。
  // own-property 校验而不是 in：localStorage 是用户可改的，"constructor" 这类 id 不能穿到 AREAS 的原型链上。
  const recentAreas = recent
    .filter((entry) => entry.kind === "area" && Object.prototype.hasOwnProperty.call(AREAS, entry.id))
    .map((entry) => entry.id as AreaId)
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 pt-6 md:pt-10">
      <PromptHero onSubmit={onSubmitIntent} onPickExample={onPickExample} pending={intentPending} />

      {recentAreas.length > 0 && (
        <div className="mt-8">
          <SectionTitle title="最近在做" />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {recentAreas.map((id) => (
              <AreaTile key={id} id={id} onOpen={onOpenArea} />
            ))}
          </div>
        </div>
      )}

      {/* 场景卡：六种最常见的开工方式，比工具名更贴近「我今天要干嘛」 */}
      <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {HOME_SCENES.map((id) => (
          <AreaTile key={id} id={id} onOpen={onOpenArea} />
        ))}
      </div>

      <div className="mt-9">
        <SectionTitle title="工具" moreLabel="全部能力" onMore={() => onOpenArea("tools")} />

        <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          {/* 两条完整流水线单独占位：它们是「一件事做到底」，不是单点工具 */}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
            {HOME_FEATURED.map((item) => {
              const meta = AREAS[item.id];
              const Icon = meta.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenArea(item.id)}
                  className={`group flex flex-col justify-between gap-5 rounded-3xl border border-line bg-gradient-to-br to-surface p-4 text-left transition-all duration-150 hover:border-brand-300 hover:shadow-card ${meta.tint}`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold tracking-tight text-ink">{item.title}</span>
                      <ArrowRight
                        size={15}
                        className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500"
                      />
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted">{item.desc}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface text-brand-500 shadow-card">
                      <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {item.steps.map((step, index) => (
                        <span key={step} className="flex items-center gap-1">
                          {index > 0 && <ChevronRight size={11} className="text-faint" aria-hidden="true" />}
                          <span className="rounded-full bg-surface/80 px-2 py-0.5 text-[11px] font-bold text-muted">
                            {step}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {HOME_TOOL_AREAS.map((id) => (
              <AreaTile key={id} id={id} onOpen={onOpenArea} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-9">
        <SectionTitle title="一键同款" moreLabel="全部模板" onMore={() => onOpenArea("templates")} />
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
          {PREVIEW_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onOpenTemplate(toImageTemplateCard(template))}
              title={template.description}
              className="overflow-hidden rounded-2xl border border-line bg-surface text-left transition-all duration-150 hover:border-brand-300 hover:shadow-card"
            >
              <div className="relative aspect-[4/3] border-b border-line bg-soft">
                <TemplatePreview template={template} sizes="180px" />
              </div>
              <div className="truncate px-2.5 py-2 text-[12px] font-bold text-muted">{template.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
