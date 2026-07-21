"use client";

import { useCallback, useState, useEffect } from "react";

interface ImageUploaderProps {
  onImageSelect: (imageUrl: string) => void;
  currentImage?: string;
}

export default function ImageUploader({
  onImageSelect,
  currentImage,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  // 处理粘贴事件
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const dataUrl = event.target?.result as string;
              onImageSelect(dataUrl);
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [onImageSelect]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          onImageSelect(dataUrl);
        };
        reader.readAsDataURL(file);
      }
    },
    [onImageSelect]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          onImageSelect(dataUrl);
        };
        reader.readAsDataURL(file);
      }
    },
    [onImageSelect]
  );

  const handleUrlSubmit = useCallback(() => {
    if (imageUrl.trim()) {
      onImageSelect(imageUrl.trim());
      setImageUrl("");
    }
  }, [imageUrl, onImageSelect]);

  return (
    <div className="space-y-4">
      {/* 当前图片预览 */}
      {currentImage && (
        <div className="relative group">
          <img
            src={currentImage}
            alt="背景图预览"
            className="w-full h-32 object-cover rounded-2xl"
          />
          <button
            onClick={() => onImageSelect("")}
            className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 拖拽上传区 */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        className={`
          relative border-2 border-dashed rounded-2xl p-4 text-center
          transition-all duration-200 cursor-pointer
          ${
            isDragging
              ? "border-brand-400 bg-brand-50"
              : "border-gray-300 hover:border-gray-400"
          }
        `}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="flex flex-col items-center gap-2">
          <svg
            className="w-8 h-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-sm text-gray-600">
            拖拽图片 / 点击上传 / Ctrl+V 粘贴
          </p>
        </div>
      </div>

      {/* URL 输入 */}
      <div className="flex gap-2">
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="或粘贴图片URL..."
          className="flex-1 px-3 py-2 text-sm border rounded-2xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-300"
          onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
        />
        <button
          onClick={handleUrlSubmit}
          disabled={!imageUrl.trim()}
          className="px-4 py-2 text-sm bg-gray-100 rounded-2xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          确定
        </button>
      </div>

      {/* 快捷提示 */}
      <p className="text-xs text-gray-400">
        推荐使用 Unsplash / Pexels 的免费图片，或自己的截图
      </p>
    </div>
  );
}
