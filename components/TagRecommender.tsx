"use client";

import { useState, useEffect } from "react";

interface TagRecommenderProps {
  suggestedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

const POPULAR_TAGS = [
  "#vibecoding",
  "#AI编程",
  "#程序员日常",
  "#效率工具",
  "#副业",
  "#自学编程",
  "#Python",
  "#前端开发",
  "#ChatGPT",
  "#Cursor",
  "#打工人",
  "#学习笔记",
  "#技术分享",
  "#AI工具",
  "#自动化",
];

export default function TagRecommender({
  suggestedTags,
  onTagsChange,
}: TagRecommenderProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>(suggestedTags);
  const [customTag, setCustomTag] = useState("");

  // Sync when AI regenerates tags
  useEffect(() => {
    setSelectedTags(suggestedTags);
  }, [suggestedTags]);

  const toggleTag = (tag: string) => {
    const updated = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(updated);
    onTagsChange(updated);
  };

  const addCustomTag = () => {
    if (!customTag.trim()) return;

    let tag = customTag.trim();
    if (!tag.startsWith("#")) {
      tag = "#" + tag;
    }

    if (!selectedTags.includes(tag)) {
      const updated = [...selectedTags, tag];
      setSelectedTags(updated);
      onTagsChange(updated);
    }
    setCustomTag("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">话题标签</label>
        <span className="text-xs text-gray-500">
          已选 {selectedTags.length} 个（建议5-8个）
        </span>
      </div>

      {/* 已选标签 */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
          {selectedTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className="inline-flex items-center gap-1 px-3 py-1 bg-xhs-red text-white rounded-full text-sm hover:bg-red-600 transition-colors"
            >
              {tag}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* 推荐标签 */}
      <div>
        <p className="text-xs text-gray-500 mb-2">点击添加热门标签</p>
        <div className="flex flex-wrap gap-2">
          {POPULAR_TAGS.filter((t) => !selectedTags.includes(t)).map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* 自定义标签 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={customTag}
          onChange={(e) => setCustomTag(e.target.value)}
          placeholder="添加自定义标签..."
          className="flex-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-xhs-red"
          onKeyDown={(e) => e.key === "Enter" && addCustomTag()}
        />
        <button
          onClick={addCustomTag}
          disabled={!customTag.trim()}
          className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          添加
        </button>
      </div>

      {/* 提示 */}
      <p className="text-xs text-gray-400">
        混搭策略：2-3个大流量标签 + 3-4个精准小标签效果最佳
      </p>
    </div>
  );
}
