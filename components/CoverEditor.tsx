"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { CoverConfig, DEFAULT_COVER_CONFIG, COLOR_PRESETS, generateCoverDataUrl, downloadCover } from "@/lib/cover";
import ImageUploader from "./ImageUploader";

interface CoverEditorProps {
  config: CoverConfig;
  onConfigChange: (config: CoverConfig) => void;
  suggestedTitle?: string;
  onCoverGenerated?: (dataUrl: string) => void;
}

export default function CoverEditor({
  config,
  onConfigChange,
  suggestedTitle,
  onCoverGenerated,
}: CoverEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [coverDataUrl, setCoverDataUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  // 生成封面
  const generateCover = useCallback(async () => {
    if (!canvasRef.current || !config) return;

    setIsGenerating(true);
    try {
      const dataUrl = await generateCoverDataUrl(canvasRef.current, config);
      setCoverDataUrl(dataUrl);
      onCoverGenerated?.(dataUrl);
    } catch (error) {
      console.error("Failed to generate cover:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [config, onCoverGenerated]);

  // 配置变化时自动生成
  useEffect(() => {
    const timer = setTimeout(generateCover, 300);
    return () => clearTimeout(timer);
  }, [generateCover]);

  const handleDownload = () => {
    if (coverDataUrl) {
      const filename = `xhs-cover-${Date.now()}.png`;
      downloadCover(coverDataUrl, filename);
    }
  };

  const updateConfig = (updates: Partial<CoverConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 左侧：预览区 */}
      <div className="relative">
        <div className="aspect-[3/4] bg-gray-100 rounded-xl overflow-hidden shadow-lg">
          {coverDataUrl ? (
            <img
              src={coverDataUrl}
              alt="封面预览"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              {isGenerating ? "生成中..." : "封面预览"}
            </div>
          )}

          {/* 下载按钮 */}
          <button
            onClick={handleDownload}
            disabled={!coverDataUrl}
            className="absolute bottom-4 right-4 px-4 py-2 bg-xhs-red text-white rounded-lg shadow-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            下载封面
          </button>
        </div>
      </div>

      {/* 隐藏的canvas用于生成 */}
      <canvas ref={canvasRef} className="hidden" />

      {/* 右侧：编辑控制 */}
      <div className="space-y-4">
        {/* 背景图上传 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            背景图片
          </label>
          <ImageUploader
            currentImage={config.backgroundImage}
            onImageSelect={(url) => updateConfig({ backgroundImage: url })}
          />
        </div>

        {/* 颜色预设 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            配色方案
          </label>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() =>
                  updateConfig({
                    backgroundColor: preset.bg,
                    overlayColor: preset.overlay,
                  })
                }
                className="flex items-center gap-2 px-3 py-1.5 border rounded-full hover:border-gray-400 transition-colors"
              >
                <span
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: preset.bg }}
                />
                <span className="text-sm">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 蒙层控制 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              蒙层透明度: {Math.round(config.overlayOpacity * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={config.overlayOpacity * 100}
              onChange={(e) =>
                updateConfig({ overlayOpacity: Number(e.target.value) / 100 })
              }
              className="w-full accent-xhs-red"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              蒙层颜色
            </label>
            <input
              type="color"
              value={config.overlayColor}
              onChange={(e) => updateConfig({ overlayColor: e.target.value })}
              className="w-full h-10 rounded cursor-pointer"
            />
          </div>
        </div>

        {/* 标题编辑 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              标题文字
            </label>
            {suggestedTitle && suggestedTitle !== config.title && (
              <button
                onClick={() => {
                  const synced = suggestedTitle.length <= 20
                    ? suggestedTitle
                    : suggestedTitle.slice(0, 16) + "...";
                  updateConfig({ title: synced });
                }}
                className="text-xs text-xhs-red hover:text-red-700 flex items-center gap-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                同步 AI 标题
              </button>
            )}
          </div>
          <textarea
            value={config.title}
            onChange={(e) => updateConfig({ title: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-xhs-red focus:border-transparent resize-none"
            placeholder="输入封面标题..."
          />
        </div>

        {/* 标题样式 */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              字号: {config.titleSize}px
            </label>
            <input
              type="range"
              min="32"
              max="96"
              value={config.titleSize}
              onChange={(e) => updateConfig({ titleSize: Number(e.target.value) })}
              className="w-full accent-xhs-red"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              位置
            </label>
            <select
              value={config.titlePosition}
              onChange={(e) =>
                updateConfig({
                  titlePosition: e.target.value as CoverConfig["titlePosition"],
                })
              }
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-xhs-red"
            >
              <option value="center">居中</option>
              <option value="left">居左</option>
              <option value="bottom">底部</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Day
            </label>
            <input
              type="number"
              min="1"
              max="999"
              value={config.dayNumber || ""}
              onChange={(e) =>
                updateConfig({
                  dayNumber: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="可选"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-xhs-red"
            />
          </div>
        </div>

        {/* 副标题 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            副标题（可选）
          </label>
          <input
            type="text"
            value={config.subtitle || ""}
            onChange={(e) => updateConfig({ subtitle: e.target.value })}
            placeholder="例如：#vibecoding #AI编程"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-xhs-red"
          />
        </div>
      </div>
    </div>
  );
}
