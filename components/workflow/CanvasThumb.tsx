"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { DEFAULT_TARGET_ID, assetRatioCss, type AssetKind } from "@/lib/targets";

/**
 * 按配置现画的一张图（封面、配图共用）。图不落库，落库的只有配置，所以要显示「这篇的图」的地方都本地画一张。
 * renderKey 变了才重画：配置对象每次都是现算的新对象，按对象身份会白画很多次。
 * 重画时不先清空——清空会闪成占位再闪回来，而画出来的往往是同一张，旧图留着直到新图就位。
 */
export default function CanvasThumb({
  kind,
  renderKey,
  render,
  className = "",
  sizes = "128px",
  alt,
  placeholder,
  onRendered,
}: {
  kind: AssetKind;
  /** 为空表示没东西可画，显示占位 */
  renderKey: string;
  render: (canvas: HTMLCanvasElement) => Promise<string>;
  className?: string;
  sizes?: string;
  alt: string;
  placeholder: string;
  /** 渲染好的 PNG dataUrl，要拿去下载或打包时传 */
  onRendered?: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  // 回调都放进 ref：调用方多半传内联函数，进依赖数组会让每次渲染都重画一张整尺寸的图
  const renderRef = useRef(render);
  renderRef.current = render;
  const onRenderedRef = useRef(onRendered);
  onRenderedRef.current = onRendered;

  useEffect(() => {
    if (!renderKey) {
      setPreviewUrl("");
      onRenderedRef.current?.("");
      return;
    }
    let isCancelled = false;
    async function renderPreview() {
      if (!canvasRef.current) return;
      try {
        const dataUrl = await renderRef.current(canvasRef.current);
        if (isCancelled) return;
        setPreviewUrl(dataUrl);
        onRenderedRef.current?.(dataUrl);
      } catch (error) {
        console.warn("[CanvasThumb] 预览渲染失败", { action: `thumb.render.${kind}`, renderKey, error });
      }
    }
    renderPreview();
    return () => {
      isCancelled = true;
    };
  }, [kind, renderKey]);

  return (
    <div
      className={`relative overflow-hidden bg-soft ${className}`}
      style={{ aspectRatio: assetRatioCss(DEFAULT_TARGET_ID, kind) }}
    >
      {previewUrl ? (
        <Image src={previewUrl} alt={alt} fill sizes={sizes} className="object-cover" unoptimized />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-faint">
          {renderKey ? "生成中" : placeholder}
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
