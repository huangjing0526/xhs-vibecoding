"use client";

import { Check, Plus } from "lucide-react";
import Card from "@/components/ui/Card";
import TemplatePreview from "@/components/workflow/TemplatePreview";
import { groupInOrder } from "@/lib/collections";
import type { ImageFactoryTemplate } from "@/lib/imageFactory";

/**
 * 图片工厂的第一级：模板列表。
 *
 * 从前这里是一条横滚的 tab，17 个模板挤在一行里，排在后面的分类要滚很远才看得到。
 * 改成按分类竖向铺开的网格：一屏扫完「这里能做哪些图」，点一张才进详情做配置。
 */
export default function ImageTemplateList({
  templates,
  batchIds,
  onSelect,
  onCreate,
}: {
  templates: ImageFactoryTemplate[];
  /** 已加入本次批次的产出，在卡片上打个角标，回列表也知道它还排着队 */
  batchIds: string[];
  onSelect: (templateId: string) => void;
  onCreate: () => void;
}) {
  const groups = groupInOrder(templates, (template) => template.category);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold leading-tight text-ink">想做哪种图</h2>
            <p className="mt-0.5 text-[11px] text-faint">
              全部由 AI 生成；挑一种点进去配好素材和画面，也可以攒成一批一起跑
            </p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100"
            aria-label="新建产出类型"
          >
            <Plus size={16} />
          </button>
        </div>
      </Card>

      {groups.map((group) => (
        <Card key={group.key}>
          <h3 className="text-sm font-bold text-ink">
            {group.key}
            <span className="ml-2 text-[11px] font-normal text-faint">{group.items.length} 种</span>
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {group.items.map((template) => {
              const queued = batchIds.includes(template.id);
              const views = template.views?.length || 0;
              const scenes = template.scenePresets?.length || 0;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onSelect(template.id)}
                  className={`overflow-hidden rounded-2xl border text-left transition-colors ${
                    queued ? "border-brand-400 bg-brand-50" : "border-line bg-surface hover:border-brand-300"
                  }`}
                >
                  <div className="relative aspect-[4/3] border-b border-line bg-soft">
                    <TemplatePreview template={template} sizes="220px" active={queued} />
                    {queued && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white shadow-brand">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className="px-2.5 py-2">
                    <div className={`truncate text-xs font-bold ${queued ? "text-brand-700" : "text-ink"}`}>
                      {template.name}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-faint">
                      {template.description || "未填写用途说明"}
                    </p>
                    {/* 比例、视角数、场景数是挑模板时真正要比的三个数，别让人点进去才知道 */}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Tag>{template.aspectRatio}</Tag>
                      {views > 0 && <Tag>{views} 视图</Tag>}
                      {scenes > 0 && <Tag>{scenes} 场景</Tag>}
                      {!template.builtIn && <Tag tone="brand">自建</Tag>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "brand" }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
        tone === "brand" ? "bg-brand-100 text-brand-700" : "bg-soft text-faint"
      }`}
    >
      {children}
    </span>
  );
}
