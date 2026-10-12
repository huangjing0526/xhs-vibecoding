"use client";

import { DEFAULT_TARGET_ID, assetPx } from "@/lib/targets";
import { generateCoverDataUrl, type CoverConfig } from "@/lib/cover";
import CanvasThumb from "@/components/workflow/CanvasThumb";

/**
 * 按封面配置现渲染的封面预览。
 *
 * 封面图不落库，落库的只有配置（见 `resolveCoverConfig`），所以任何要显示「这篇的封面」
 * 的地方都在本地画一张，而不是共用某次会话里生成的那张 dataUrl——那张图只属于当时选中的那篇。
 */
export default function CoverThumb({
  config,
  className = "",
  sizes = "128px",
  alt = "封面预览",
  onRendered,
}: {
  config: CoverConfig;
  /** 控制外框宽度与圆角；比例由目标档案决定，不接受覆盖 */
  className?: string;
  sizes?: string;
  alt?: string;
  /** 渲染好的 PNG dataUrl。发布包要拿它去打包，光显示的地方不用传 */
  onRendered?: (dataUrl: string) => void;
}) {
  return (
    <CanvasThumb
      kind="cover"
      renderKey={JSON.stringify(config)}
      render={(canvas) => generateCoverDataUrl(canvas, config, assetPx(DEFAULT_TARGET_ID, "cover"))}
      className={className}
      sizes={sizes}
      alt={alt}
      placeholder="生成中"
      onRendered={onRendered}
    />
  );
}
