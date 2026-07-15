"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CoverConfig,
  DEFAULT_COVER_CONFIG,
  downloadCover,
  generateCoverDataUrl,
} from "@/lib/cover";
import type { CoverTemplateOption } from "@/lib/coverWorkflow";
import { DEFAULT_TARGET_ID, assetPx, assetRatioCss } from "@/lib/targets";
import ImageUploader from "./ImageUploader";

interface CoverEditorProps {
  config: CoverConfig;
  templates?: CoverTemplateOption[];
  onConfigChange: (config: CoverConfig) => void;
  suggestedTitle?: string;
  onCoverGenerated?: (dataUrl: string) => void;
}

function uniqueText(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function trimSuggestedTitle(title?: string): string {
  if (!title) return "";
  const clean = title.replace(/[｜|:：]/g, "\n").replace(/\s+/g, " ").trim();
  if (clean.length <= 20) return clean;
  return `${clean.slice(0, 10)}\n${clean.slice(10, 20)}`;
}

function getPositionLabel(position: CoverConfig["titlePosition"]): string {
  const map: Record<CoverConfig["titlePosition"], string> = {
    center: "居中",
    left: "左对齐",
    bottom: "底部",
  };
  return map[position];
}

export default function CoverEditor({
  config,
  templates = [],
  onConfigChange,
  suggestedTitle,
  onCoverGenerated,
}: CoverEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [coverDataUrl, setCoverDataUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const titleOptions = useMemo(
    () =>
      uniqueText([
        ...templates.map((template) => template.title),
        trimSuggestedTitle(suggestedTitle),
        DEFAULT_COVER_CONFIG.title,
      ]).slice(0, 8),
    [suggestedTitle, templates]
  );

  const generateCover = useCallback(async () => {
    if (!canvasRef.current || !config) return;

    setIsGenerating(true);
    try {
      const dataUrl = await generateCoverDataUrl(
        canvasRef.current,
        config,
        assetPx(DEFAULT_TARGET_ID, "cover")
      );
      setCoverDataUrl(dataUrl);
      onCoverGenerated?.(dataUrl);
    } catch (error) {
      console.error("[CoverEditor] 封面生成失败", {
        action: "cover.generatePreview",
        error,
      });
    } finally {
      setIsGenerating(false);
    }
  }, [config, onCoverGenerated]);

  useEffect(() => {
    const timer = window.setTimeout(generateCover, 240);
    return () => window.clearTimeout(timer);
  }, [generateCover]);

  const updateConfig = (updates: Partial<CoverConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  const applyTemplate = (template: CoverTemplateOption) => {
    onConfigChange({
      ...template.config,
      sourceKey: config.sourceKey || template.config.sourceKey,
      dayNumber: config.dayNumber,
    });
  };

  const handleDownload = () => {
    if (!coverDataUrl) return;
    downloadCover(coverDataUrl, `xhs-cover-${Date.now()}.png`);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="border border-stone-300 bg-stone-50 p-4">
        <div className="mx-auto max-w-[420px]">
          <div
            className="relative overflow-hidden border border-stone-950 bg-stone-200 shadow-[10px_10px_0_#1c1917]"
            style={{ aspectRatio: assetRatioCss(DEFAULT_TARGET_ID, "cover") }}
          >
            {coverDataUrl ? (
              <img
                src={coverDataUrl}
                alt="封面预览"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-stone-500">
                {isGenerating ? "生成中" : "封面预览"}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
            <div className="border border-stone-200 bg-white px-3 py-2">
              <div className="text-xs font-bold text-stone-400">当前模板</div>
              <div className="mt-1 text-sm font-black text-stone-950">
                {templates.find((template) => template.id === config.templateId)?.name || "自定义"}
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!coverDataUrl}
              className="border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-stone-950 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
            >
              下载
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="border border-stone-300 bg-white">
          <div className="border-b border-stone-200 px-4 py-3">
            <h3 className="font-black text-stone-950">整体模板</h3>
            <p className="mt-1 text-xs text-stone-500">背景、字体、字号、颜色和布局一起切换</p>
          </div>
          <div className="grid gap-2 p-3 md:grid-cols-2">
            {templates.map((template) => {
              const isActive = config.templateId === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className={`border p-3 text-left transition-colors ${
                    isActive
                      ? "border-stone-950 bg-stone-950 text-white"
                      : "border-stone-200 bg-white hover:border-stone-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-black">{template.name}</div>
                    <div
                      className="h-5 w-5 border"
                      style={{
                        backgroundColor: template.config.backgroundColor,
                        borderColor: template.config.accentColor || template.config.titleColor,
                      }}
                    />
                  </div>
                  <div className={`mt-2 text-xs ${isActive ? "text-stone-300" : "text-stone-500"}`}>
                    {template.previewTone}
                  </div>
                  <div className={`mt-2 whitespace-pre-wrap text-sm font-black leading-5 ${isActive ? "text-white" : "text-stone-950"}`}>
                    {template.title}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border border-stone-300 bg-white">
          <div className="border-b border-stone-200 px-4 py-3">
            <h3 className="font-black text-stone-950">换文案</h3>
            <p className="mt-1 text-xs text-stone-500">日常使用优先改这里</p>
          </div>
          <div className="space-y-3 p-4">
            <div className="grid gap-2 md:grid-cols-2">
              {titleOptions.map((title) => (
                <button
                  key={title}
                  type="button"
                  onClick={() => updateConfig({ title })}
                  className={`border px-3 py-2 text-left text-sm font-bold leading-5 transition-colors ${
                    config.title === title
                      ? "border-rose-600 bg-rose-50 text-rose-700"
                      : "border-stone-200 bg-white text-stone-700 hover:border-stone-500"
                  }`}
                >
                  <span className="whitespace-pre-wrap">{title}</span>
                </button>
              ))}
            </div>

            <label className="block">
              <span className="text-xs font-bold text-stone-500">封面大字</span>
              <textarea
                value={config.title}
                onChange={(event) => updateConfig({ title: event.target.value })}
                rows={3}
                className="mt-2 w-full resize-none border border-stone-300 px-3 py-2 text-base font-black leading-6 text-stone-950 outline-none transition-colors focus:border-rose-600"
                placeholder="输入封面大字"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-stone-500">副标题 / 标签</span>
              <input
                type="text"
                value={config.subtitle || ""}
                onChange={(event) => updateConfig({ subtitle: event.target.value })}
                className="mt-2 w-full border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-900 outline-none transition-colors focus:border-rose-600"
                placeholder="#AI编程 #VibeCoding"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="text-xs font-bold text-stone-500">字号 {config.titleSize}px</span>
                <input
                  type="range"
                  min="56"
                  max="112"
                  value={config.titleSize}
                  onChange={(event) => updateConfig({ titleSize: Number(event.target.value) })}
                  className="mt-3 w-full accent-rose-600"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-stone-500">Day</span>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={config.dayNumber || ""}
                  onChange={(event) =>
                    updateConfig({
                      dayNumber: event.target.value ? Number(event.target.value) : undefined,
                    })
                  }
                  className="mt-2 w-24 border border-stone-300 px-3 py-2 text-sm font-semibold outline-none focus:border-rose-600"
                  placeholder="可选"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="border border-stone-300 bg-white">
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span>
              <span className="block font-black text-stone-950">高级样式</span>
              <span className="mt-1 block text-xs text-stone-500">需要微调颜色、位置或上传背景时再打开</span>
            </span>
            <span className="text-sm font-black text-stone-400">{showAdvanced ? "收起" : "展开"}</span>
          </button>

          {showAdvanced && (
            <div className="space-y-4 border-t border-stone-200 p-4">
              <div>
                <div className="mb-2 text-xs font-bold text-stone-500">背景图片</div>
                <ImageUploader
                  currentImage={config.backgroundImage}
                  onImageSelect={(url) => updateConfig({ backgroundImage: url })}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-bold text-stone-500">标题颜色</span>
                  <input
                    type="color"
                    value={config.titleColor}
                    onChange={(event) => updateConfig({ titleColor: event.target.value })}
                    className="mt-2 h-10 w-full cursor-pointer border border-stone-300 bg-white"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-stone-500">背景色</span>
                  <input
                    type="color"
                    value={config.backgroundColor}
                    onChange={(event) => updateConfig({ backgroundColor: event.target.value, backgroundImage: undefined })}
                    className="mt-2 h-10 w-full cursor-pointer border border-stone-300 bg-white"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-stone-500">强调色</span>
                  <input
                    type="color"
                    value={config.accentColor || config.overlayColor}
                    onChange={(event) => updateConfig({ accentColor: event.target.value })}
                    className="mt-2 h-10 w-full cursor-pointer border border-stone-300 bg-white"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold text-stone-500">
                    蒙层透明度 {Math.round(config.overlayOpacity * 100)}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    value={config.overlayOpacity * 100}
                    onChange={(event) => updateConfig({ overlayOpacity: Number(event.target.value) / 100 })}
                    className="mt-3 w-full accent-rose-600"
                  />
                </label>
                <div>
                  <div className="text-xs font-bold text-stone-500">文字位置</div>
                  <div className="mt-2 grid grid-cols-3 border border-stone-300">
                    {(["left", "center", "bottom"] as const).map((position) => (
                      <button
                        key={position}
                        type="button"
                        onClick={() => updateConfig({ titlePosition: position })}
                        className={`px-2 py-2 text-xs font-bold ${
                          config.titlePosition === position
                            ? "bg-stone-950 text-white"
                            : "bg-white text-stone-700 hover:bg-stone-50"
                        }`}
                      >
                        {getPositionLabel(position)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
