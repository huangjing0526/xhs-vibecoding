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
      <div className="rounded-3xl border border-line bg-soft p-4">
        <div className="mx-auto max-w-[420px]">
          <div
            className="relative overflow-hidden rounded-2xl border border-line bg-sunken shadow-raised"
            style={{ aspectRatio: assetRatioCss(DEFAULT_TARGET_ID, "cover") }}
          >
            {coverDataUrl ? (
              <img
                src={coverDataUrl}
                alt="封面预览"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-faint">
                {isGenerating ? "生成中" : "封面预览"}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
            <div className="rounded-2xl border border-line bg-surface px-3 py-2.5">
              <div className="text-xs font-bold text-faint">当前模板</div>
              <div className="mt-1 text-sm font-bold text-ink">
                {templates.find((template) => template.id === config.templateId)?.name || "自定义"}
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!coverDataUrl}
              className="h-9 shrink-0 rounded-xl bg-ink px-4 text-sm font-bold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-sunken disabled:text-faint"
            >
              下载
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
          <div className="border-b border-line px-4 py-3">
            <h3 className="font-bold text-ink">整体模板</h3>
            <p className="mt-1 text-xs text-faint">背景、字体、字号、颜色和布局一起切换</p>
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
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-white hover:border-line-strong"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold">{template.name}</div>
                    <div
                      className="h-5 w-5 rounded-md border border-line"
                      style={{
                        backgroundColor: template.config.backgroundColor,
                        borderColor: template.config.accentColor || template.config.titleColor,
                      }}
                    />
                  </div>
                  <div className={`mt-2 text-xs ${isActive ? "text-faint" : "text-faint"}`}>
                    {template.previewTone}
                  </div>
                  <div className={`mt-2 whitespace-pre-wrap text-sm font-bold leading-5 ${isActive ? "text-white" : "text-ink"}`}>
                    {template.title}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
          <div className="border-b border-line px-4 py-3">
            <h3 className="font-bold text-ink">换文案</h3>
            <p className="mt-1 text-xs text-faint">日常使用优先改这里</p>
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
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-line bg-white text-muted hover:border-line-strong"
                  }`}
                >
                  <span className="whitespace-pre-wrap">{title}</span>
                </button>
              ))}
            </div>

            <label className="block">
              <span className="text-xs font-bold text-faint">封面大字</span>
              <textarea
                value={config.title}
                onChange={(event) => updateConfig({ title: event.target.value })}
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-line bg-soft px-3.5 py-2.5 text-base font-bold leading-6 text-ink outline-none transition-colors focus:border-brand-300 focus:bg-surface focus:ring-4 focus:ring-brand-500/10"
                placeholder="输入封面大字"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-faint">副标题 / 标签</span>
              <input
                type="text"
                value={config.subtitle || ""}
                onChange={(event) => updateConfig({ subtitle: event.target.value })}
                className="mt-2 h-10 w-full rounded-xl border border-line bg-soft px-3.5 text-sm font-semibold text-ink outline-none transition-colors focus:border-brand-300 focus:bg-surface focus:ring-4 focus:ring-brand-500/10"
                placeholder="#AI编程 #VibeCoding"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="text-xs font-bold text-faint">字号 {config.titleSize}px</span>
                <input
                  type="range"
                  min="56"
                  max="112"
                  value={config.titleSize}
                  onChange={(event) => updateConfig({ titleSize: Number(event.target.value) })}
                  className="mt-3 w-full accent-brand-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-faint">Day</span>
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
                  className="mt-2 h-10 w-24 rounded-xl border border-line bg-soft px-3.5 text-sm font-semibold outline-none focus:border-brand-300 focus:bg-surface focus:ring-4 focus:ring-brand-500/10"
                  placeholder="可选"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span>
              <span className="block font-bold text-ink">高级样式</span>
              <span className="mt-1 block text-xs text-faint">需要微调颜色、位置或上传背景时再打开</span>
            </span>
            <span className="text-sm font-bold text-faint">{showAdvanced ? "收起" : "展开"}</span>
          </button>

          {showAdvanced && (
            <div className="space-y-4 border-t border-line p-4">
              <div>
                <div className="mb-2 text-xs font-bold text-faint">背景图片</div>
                <ImageUploader
                  currentImage={config.backgroundImage}
                  onImageSelect={(url) => updateConfig({ backgroundImage: url })}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-bold text-faint">标题颜色</span>
                  <input
                    type="color"
                    value={config.titleColor}
                    onChange={(event) => updateConfig({ titleColor: event.target.value })}
                    className="mt-2 h-10 w-full cursor-pointer rounded-xl border border-line bg-surface"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-faint">背景色</span>
                  <input
                    type="color"
                    value={config.backgroundColor}
                    onChange={(event) => updateConfig({ backgroundColor: event.target.value, backgroundImage: undefined })}
                    className="mt-2 h-10 w-full cursor-pointer rounded-xl border border-line bg-surface"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-faint">强调色</span>
                  <input
                    type="color"
                    value={config.accentColor || config.overlayColor}
                    onChange={(event) => updateConfig({ accentColor: event.target.value })}
                    className="mt-2 h-10 w-full cursor-pointer rounded-xl border border-line bg-surface"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold text-faint">
                    蒙层透明度 {Math.round(config.overlayOpacity * 100)}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    value={config.overlayOpacity * 100}
                    onChange={(event) => updateConfig({ overlayOpacity: Number(event.target.value) / 100 })}
                    className="mt-3 w-full accent-brand-500"
                  />
                </label>
                <div>
                  <div className="text-xs font-bold text-faint">文字位置</div>
                  <div className="mt-2 grid grid-cols-3 gap-1 rounded-2xl bg-soft p-1">
                    {(["left", "center", "bottom"] as const).map((position) => (
                      <button
                        key={position}
                        type="button"
                        onClick={() => updateConfig({ titlePosition: position })}
                        className={`rounded-xl px-2 py-1.5 text-xs font-bold transition-all ${
                          config.titlePosition === position
                            ? "bg-surface text-ink shadow-card"
                            : "text-muted hover:text-ink"
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
