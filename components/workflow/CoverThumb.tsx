"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { DEFAULT_TARGET_ID, assetPx, assetRatioCss } from "@/lib/targets";
import { generateCoverDataUrl, type CoverConfig } from "@/lib/cover";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  // 回调放进 ref：调用方多半是内联箭头函数，进依赖数组会让每次渲染都重画一张 1080×1440
  const onRenderedRef = useRef(onRendered);
  onRenderedRef.current = onRendered;

  useEffect(() => {
    let isCancelled = false;
    // 不先清空：配置对象每次都是现算的新对象，保存一次草稿就会重画一张图。
    // 清空会让缩略图闪成「生成中」再闪回来，而画出来的往往是同一张——旧图留着直到新图就位。
    async function renderPreview() {
      if (!canvasRef.current) return;

      try {
        const dataUrl = await generateCoverDataUrl(canvasRef.current, config, assetPx(DEFAULT_TARGET_ID, "cover"));
        if (isCancelled) return;
        setPreviewUrl(dataUrl);
        onRenderedRef.current?.(dataUrl);
      } catch (error) {
        console.warn("[CoverThumb] 封面预览渲染失败", {
          action: "cover.renderThumb",
          error,
        });
      }
    }

    renderPreview();
    return () => {
      isCancelled = true;
    };
  }, [config]);

  return (
    <div
      className={`relative overflow-hidden bg-soft ${className}`}
      style={{ aspectRatio: assetRatioCss(DEFAULT_TARGET_ID, "cover") }}
    >
      {previewUrl ? (
        <Image src={previewUrl} alt={alt} fill sizes={sizes} className="object-cover" unoptimized />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-faint">生成中</div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
