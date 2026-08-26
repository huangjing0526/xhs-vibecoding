"use client";

import Image from "next/image";
import { Maximize2 } from "lucide-react";
import Card from "@/components/ui/Card";
import TemplateThumb from "@/components/workflow/TemplateThumb";
import type { ImageFactoryTemplate } from "@/lib/imageFactory";

/**
 * 详情页右栏的「这个模板长什么样」。
 *
 * 从前样例只有卡片角落一张 3.4rem 的小图，看不出所以然；配图的时候最想确认的恰恰是
 * 「它跑出来到底是什么样、每个视角拍成什么样、要我传哪几张图」，所以在操作区旁边常驻一份。
 */
export default function TemplateSpecCard({
  template,
  onZoom,
}: {
  template: ImageFactoryTemplate;
  onZoom: () => void;
}) {
  const views = template.views || [];

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">看看这个模板</h2>
          <p className="mt-0.5 text-[11px] leading-4 text-faint">{template.description || "未填写用途说明"}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onZoom}
        className="group relative mt-3 block aspect-[4/5] w-full overflow-hidden rounded-2xl border border-line bg-soft"
        aria-label={`看${template.name}的产出样例大图`}
      >
        {template.preview ? (
          <Image src={template.preview} alt="" fill sizes="320px" className="object-cover" unoptimized />
        ) : (
          <TemplateThumb thumb={template.thumb} active />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-ink/45 opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 size={16} className="text-white" />
        </span>
      </button>

      <dl className="mt-3 space-y-1.5 text-[11px] leading-5">
        <SpecRow label="画幅" value={template.aspectRatio} />
        <SpecRow
          label="要传的图"
          value={
            template.slots.length > 0
              ? template.slots.map((slot) => `${slot.label}${slot.required ? "（必传）" : ""}`).join("、")
              : "不用传图，按文字生成"
          }
        />
        {views.length > 0 && <SpecRow label="输出视图" value={`${views.length} 个视角`} />}
      </dl>

      {views.length > 0 && (
        <div className="mt-3">
          <h3 className="text-[11px] font-bold text-muted">每个视角长这样</h3>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {views.map((view) => (
              <div key={view.id} className="overflow-hidden rounded-xl border border-line bg-soft" title={view.hint}>
                <div className="relative aspect-square">
                  {view.preview ? (
                    <Image src={view.preview} alt="" fill sizes="80px" className="object-cover" unoptimized />
                  ) : (
                    <span className="flex h-full items-center justify-center px-1 text-center text-[9px] leading-3 text-faint">
                      暂无样例
                    </span>
                  )}
                </div>
                <div className="truncate px-1 py-1 text-[9px] font-bold text-faint">{view.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 text-faint">{label}</dt>
      <dd className="min-w-0 flex-1 text-muted">{value}</dd>
    </div>
  );
}
