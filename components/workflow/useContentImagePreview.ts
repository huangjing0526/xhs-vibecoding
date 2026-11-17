"use client";

import { useEffect, useRef, useState } from "react";
import { renderContentImageDataUrl, type ContentImagePlan } from "@/lib/imageWorkflow";

/**
 * plan → PNG dataUrl 的渲染时序，供所有内容配图预览共用。
 *
 * 绘制只能在浏览器做（renderContentImageDataUrl 吃 HTMLCanvasElement），所以每个预览点
 * 都要重复「隐藏 canvas + 换 plan 时清空 + 取消标志防竞态 + 失败兜底」这套。收成一份，
 * 免得改了封面工作台漏掉模板结果页。
 *
 * 只返回数据，不带外壳：各处的边框、占位、尺寸约束各不相同，塞进来反而要加开关。
 */
export function useContentImagePreview(options: {
  plan: ContentImagePlan | null;
  px: readonly [number, number];
  /** 出错时的用户可见提示。不传则只记日志（调用方自己决定要不要打扰用户）。 */
  onError?: (message: string) => void;
}): { canvasRef: React.RefObject<HTMLCanvasElement | null>; dataUrl: string } {
  const { plan, px, onError } = options;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState("");

  const [width, height] = px;

  useEffect(() => {
    let cancelled = false;
    setDataUrl("");

    async function render() {
      if (!canvasRef.current || !plan) return;

      try {
        const url = await renderContentImageDataUrl(canvasRef.current, plan, [width, height]);
        if (!cancelled) setDataUrl(url);
      } catch (error) {
        console.error("[useContentImagePreview] 内容配图渲染失败", {
          action: "image.renderContentPreview",
          templateType: plan.templateType,
          error,
        });
        if (!cancelled) onError?.("图片渲染失败，请重试或换个模板");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
    // px 是元组字面量，逐值依赖，避免调用方每次渲染新建数组导致重绘
  }, [height, onError, plan, width]);

  return { canvasRef, dataUrl };
}
