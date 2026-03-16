"use client";

import { useState, useEffect } from "react";
import { HistoryEntry, loadRichHistory, deleteRichHistoryEntry } from "@/lib/similarity";

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onReuse: (entry: HistoryEntry) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  vibecoding: "💻 Vibecoding",
  "store-visit": "🍜 探店",
  "product-review": "🛍️ 测评",
  "study-notes": "📚 学习",
  lifestyle: "✨ 生活",
  "emotion-story": "💭 情感",
};

export default function HistoryDrawer({ isOpen, onClose, onReuse }: HistoryDrawerProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isOpen) {
      setEntries(loadRichHistory());
      setSearchQuery("");
    }
  }, [isOpen]);

  const filteredEntries = searchQuery.trim()
    ? entries.filter(
        (e) =>
          e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : entries;

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    setTimeout(() => {
      deleteRichHistoryEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setDeletingId(null);
    }, 200);
  };

  const handleReuse = (entry: HistoryEntry) => {
    onReuse(entry);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">历史记录</h2>
            <p className="text-xs text-gray-400 mt-0.5">{entries.length} 条生成记录</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 搜索框 */}
        {entries.length > 0 && (
          <div className="px-4 py-3 border-b">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索标题或标签..."
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-xhs-red/30 focus:border-xhs-red"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">还没有生成记录</p>
              <p className="text-xs mt-1">生成文案后会自动保存到这里</p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm">没有找到匹配的记录</p>
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <div
                key={entry.id}
                className={`border rounded-xl overflow-hidden transition-all ${
                  deletingId === entry.id ? "opacity-0 scale-95" : "opacity-100"
                }`}
              >
                {/* Card header */}
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-2">
                      {entry.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {entry.contentType && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {CONTENT_TYPE_LABELS[entry.contentType] || entry.contentType}
                        </span>
                      )}
                      {entry.wordCount && (
                        <span className="text-xs text-gray-400">{entry.wordCount} 字</span>
                      )}
                      <span className="text-xs text-gray-400">{formatRelativeTime(entry.timestamp)}</span>
                    </div>
                    {/* Tags preview */}
                    {entry.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {entry.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-xs text-xhs-red/70 bg-red-50 px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                        {entry.tags.length > 3 && (
                          <span className="text-xs text-gray-400">+{entry.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <svg
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${
                      expandedId === entry.id ? "rotate-180" : ""
                    }`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded content */}
                {expandedId === entry.id && (
                  <div className="px-4 pb-4 space-y-3 border-t bg-gray-50">
                    <p className="text-xs text-gray-600 leading-relaxed pt-3 line-clamp-6 whitespace-pre-line">
                      {entry.content}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReuse(entry)}
                        className="flex-1 py-2 text-sm font-medium bg-gradient-to-r from-xhs-red to-xhs-pink text-white rounded-lg hover:shadow-md transition-all"
                      >
                        以此为基础重写
                      </button>
                      <button
                        onClick={(e) => handleDelete(entry.id, e)}
                        className="px-3 py-2 text-sm text-gray-400 hover:text-red-500 border rounded-lg hover:border-red-200 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
