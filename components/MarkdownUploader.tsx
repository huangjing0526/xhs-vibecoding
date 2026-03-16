"use client";

import { useCallback, useState } from "react";

interface MarkdownUploaderProps {
  onUpload: (content: string, filename: string) => void;
}

export default function MarkdownUploader({ onUpload }: MarkdownUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith(".md") || file.name.endsWith(".markdown"))) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          onUpload(content, file.name);
        };
        reader.readAsText(file);
      }
    },
    [onUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          onUpload(content, file.name);
        };
        reader.readAsText(file);
      }
    },
    [onUpload]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        relative border-2 border-dashed rounded-xl p-8 text-center
        transition-all duration-200 cursor-pointer
        ${
          isDragging
            ? "border-xhs-red bg-red-50 scale-[1.02]"
            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
        }
      `}
    >
      <input
        type="file"
        accept=".md,.markdown"
        onChange={handleFileSelect}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />

      <div className="flex flex-col items-center gap-3">
        <svg
          className={`w-12 h-12 ${isDragging ? "text-xhs-red" : "text-gray-400"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>

        <div>
          <p className="text-lg font-medium text-gray-700">
            {isDragging ? "松开上传文件" : "拖拽 Markdown 文件到这里"}
          </p>
          <p className="text-sm text-gray-500 mt-1">或点击选择文件 (.md)</p>
        </div>
      </div>
    </div>
  );
}
