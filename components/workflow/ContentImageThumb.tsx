"use client";

import { DEFAULT_TARGET_ID, assetPx } from "@/lib/targets";
import { renderContentImageDataUrl, type ContentImagePlan } from "@/lib/imageWorkflow";
import CanvasThumb from "@/components/workflow/CanvasThumb";

/** 按配图方案现画的配图。与封面同一套：落库的只有方案（见 app/api/notes/assets），图要用时才画。 */
export default function ContentImageThumb({
  plan,
  className = "",
  sizes = "128px",
  alt = "配图",
  placeholder = "等待生成",
  onRendered,
}: {
  plan: ContentImagePlan | null;
  className?: string;
  sizes?: string;
  alt?: string;
  placeholder?: string;
  onRendered?: (dataUrl: string) => void;
}) {
  return (
    <CanvasThumb
      kind="content"
      renderKey={plan ? JSON.stringify(plan) : ""}
      render={(canvas) => renderContentImageDataUrl(canvas, plan as ContentImagePlan, assetPx(DEFAULT_TARGET_ID, "content"))}
      className={className}
      sizes={sizes}
      alt={alt}
      placeholder={placeholder}
      onRendered={onRendered}
    />
  );
}
