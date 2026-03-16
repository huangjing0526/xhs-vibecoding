"use client";

import { useRef, useState } from "react";

interface XHSPhonePreviewProps {
  title: string;
  content: string;
  tags: string[];
  coverUrl?: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function XHSPhonePreview({
  title,
  content,
  tags,
  coverUrl,
  isOpen,
  onClose,
}: XHSPhonePreviewProps) {
  const postRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const [exportError, setExportError] = useState("");

  const handleExport = async () => {
    try {
      const text = `${title}\n\n${content}\n\n${tags.join(" ")}`;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setExportError("");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setExportError("复制失败，请手动选择文字复制");
      setTimeout(() => setExportError(""), 3000);
    }
  };

  if (!isOpen) return null;

  const paragraphs = content.split(/\n{2,}/).filter(Boolean);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-4">
        {/* Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur rounded-full text-sm font-medium text-gray-700 hover:bg-white shadow-lg transition-all"
          >
            {exportError ? (
              <span className="text-red-500 text-xs">{exportError}</span>
            ) : copied ? (
              <>
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                已复制文案
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                复制全部文案
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur rounded-full text-sm font-medium text-gray-600 hover:bg-white shadow-lg transition-all"
          >
            关闭预览
          </button>
        </div>

        {/* Phone shell */}
        <div className="relative w-[320px]">
          {/* Outer phone frame */}
          <div className="relative bg-gray-900 rounded-[44px] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.5)] border border-gray-700">
            {/* Screen bezel */}
            <div className="bg-white rounded-[36px] overflow-hidden relative" style={{ height: "620px" }}>
              {/* Dynamic island / notch */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-gray-900 rounded-full z-10" />

              {/* XHS App UI */}
              <div className="h-full flex flex-col bg-gray-50">
                {/* Status bar */}
                <div className="h-10 flex items-end justify-between px-5 pb-1.5 bg-white">
                  <span className="text-[10px] font-semibold text-gray-900">9:41</span>
                  <div className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M1.5 8.5a13 13 0 0121 0M5 12a10 10 0 0114 0M8.5 15.5a6 6 0 017 0M12 19h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
                    </svg>
                    <svg className="w-3 h-2.5 text-gray-900" fill="currentColor" viewBox="0 0 24 16">
                      <rect x="0" y="4" width="18" height="12" rx="2" ry="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                      <rect x="19" y="7" width="3" height="6" rx="1" fill="currentColor"/>
                      <rect x="1" y="5" width="14" height="10" rx="1" fill="currentColor"/>
                    </svg>
                  </div>
                </div>

                {/* XHS Top Nav */}
                <div className="bg-white px-4 py-2 flex items-center justify-between border-b border-gray-100">
                  <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="text-xs font-medium text-gray-700">笔记详情</span>
                  <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01" />
                  </svg>
                </div>

                {/* Scrollable post content */}
                <div ref={postRef} className="flex-1 overflow-y-auto bg-white">
                  {/* Cover image */}
                  <div className="w-full aspect-[4/3] bg-gradient-to-br from-red-100 to-pink-100 flex items-center justify-center overflow-hidden">
                    {coverUrl ? (
                      <img src={coverUrl} alt="封面" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center px-4">
                        <div className="text-2xl mb-2">📱</div>
                        <p className="text-xs text-gray-400">封面图</p>
                      </div>
                    )}
                  </div>

                  {/* Post content */}
                  <div className="px-4 py-3 space-y-3">
                    {/* Author row */}
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-xhs-red to-xhs-pink flex items-center justify-center">
                        <span className="text-white text-xs font-bold">V</span>
                      </div>
                      <span className="text-xs font-medium text-gray-800">VibeNote 用户</span>
                      <span className="ml-auto text-xs text-xhs-red border border-xhs-red/40 px-2 py-0.5 rounded-full">
                        关注
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-bold text-gray-900 leading-snug">{title}</h3>

                    {/* Body */}
                    <div className="space-y-2">
                      {paragraphs.map((para, i) => (
                        <p key={i} className="text-xs text-gray-700 leading-relaxed">
                          {para}
                        </p>
                      ))}
                    </div>

                    {/* Tags */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {tags.map((tag) => (
                          <span key={tag} className="text-xs text-xhs-red/80">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Engagement bar */}
                    <div className="flex items-center justify-around pt-2 border-t border-gray-100">
                      {[
                        { icon: "❤️", count: "2.3k" },
                        { icon: "⭐", count: "1.1k" },
                        { icon: "💬", count: "238" },
                      ].map(({ icon, count }) => (
                        <button key={icon} className="flex flex-col items-center gap-0.5">
                          <span className="text-base">{icon}</span>
                          <span className="text-[10px] text-gray-400">{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom nav */}
                <div className="bg-white border-t border-gray-100 px-4 py-2 flex items-center justify-around">
                  {["🏠", "🔍", "➕", "💬", "👤"].map((icon) => (
                    <button key={icon} className="text-base opacity-60 hover:opacity-100">
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Home indicator */}
            <div className="flex justify-center pt-2">
              <div className="w-24 h-1 bg-gray-600 rounded-full" />
            </div>
          </div>

          {/* Phone side buttons */}
          <div className="absolute left-[-4px] top-20 w-1 h-10 bg-gray-700 rounded-l-sm" />
          <div className="absolute left-[-4px] top-36 w-1 h-8 bg-gray-700 rounded-l-sm" />
          <div className="absolute left-[-4px] top-48 w-1 h-8 bg-gray-700 rounded-l-sm" />
          <div className="absolute right-[-4px] top-28 w-1 h-12 bg-gray-700 rounded-r-sm" />
        </div>
      </div>
    </>
  );
}
