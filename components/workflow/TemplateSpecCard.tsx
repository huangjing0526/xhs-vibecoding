"use client";

import Image from "next/image";
import { Maximize2 } from "lucide-react";
import Card from "@/components/ui/Card";
import TemplateThumb from "@/components/workflow/TemplateThumb";
import { aspectRatioStyle, type ImageFactoryTemplate } from "@/lib/imageFactory";

/**
 * 详情页右栏的「这个模板长什么样」。
 *
 * 从前样例只有卡片角落一张 3.4rem 的小图，看不出所以然；配图的时候最想确认的恰恰是
 * 「它跑出来到底是什么样、要我传哪几张图」，所以在操作区旁边常驻一份。
 * 每个视角的样例不放这儿——左栏的「③ 输出视图」本来就要逐个勾选，同一组缩略图摆两遍只是噪音。
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

      {/* 框按声明画幅取形，图整张放进去不裁——形状说明产出比例，内容说明产出长相，两件事都不能丢 */}
      <button
        type="button"
        onClick={onZoom}
        style={aspectRatioStyle(template.aspectRatio)}
        className="group relative mt-3 block w-full overflow-hidden rounded-2xl border border-line bg-soft"
        aria-label={`看${template.name}的产出样例大图`}
      >
        {template.preview ? (
          <Image src={template.preview} alt="" fill sizes="320px" className="object-contain" unoptimized />
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
        {views.length > 0 && <SpecRow label="输出视图" value={`${views.length} 个视角，在左边逐个勾`} />}
      </dl>

      {/* 样例里出现的人和物只是这个模板跑出来的一次结果，不是你会拿到的那个 */}
      <p className="mt-3 text-[10px] leading-4 text-faint">样例只示意产出的结构与角度，实际出图用你在左边上传的素材。</p>
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
