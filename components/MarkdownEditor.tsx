"use client";

import { useState, useEffect, useCallback } from "react";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
}: MarkdownEditorProps) {
  const [wordCount, setWordCount] = useState(0);
  const [lineCount, setLineCount] = useState(0);

  useEffect(() => {
    // 计算中文字数（不包括空格和标点）
    const chineseChars = value.match(/[\u4e00-\u9fa5]/g) || [];
    const englishWords = value.match(/[a-zA-Z]+/g) || [];
    setWordCount(chineseChars.length + englishWords.length);

    // 计算行数
    setLineCount(value.split("\n").length);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab 键插入空格
      if (e.key === "Tab") {
        e.preventDefault();
        const target = e.target as HTMLTextAreaElement;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const newValue = value.substring(0, start) + "  " + value.substring(end);
        onChange(newValue);
        // 设置光标位置
        setTimeout(() => {
          target.selectionStart = target.selectionEnd = start + 2;
        }, 0);
      }
    },
    [value, onChange]
  );

  const insertTemplate = useCallback(() => {
    const template = `---
title: "Day X | 今日标题"
tags: ["vibecoding", "AI编程"]
mood: "excited"
---

# 今日主题

## 背景
今天想解决的问题...

## 过程
- 使用了什么工具
- 遇到了什么问题
- 如何解决的

## 收获
今天学到了...

## 感悟
一句话总结...
`;
    onChange(template);
  }, [onChange]);

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <button
            onClick={insertTemplate}
            className="px-3 py-1 text-sm bg-white border rounded hover:bg-gray-50 transition-colors"
          >
            插入模板
          </button>
          <button
            onClick={() => onChange("")}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            清空
          </button>
        </div>
        <div className="text-sm text-gray-500">
          {wordCount} 字 · {lineCount} 行
        </div>
      </div>

      {/* 编辑区 */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "在这里输入 Markdown 内容...\n\n支持 frontmatter：\n---\ntitle: \"标题\"\ntags: [\"标签\"]\nmood: \"心情\"\n---"}
        className="
          flex-1 w-full p-4 resize-none
          font-mono text-sm leading-relaxed
          border-0 focus:ring-0 focus:outline-none
          placeholder:text-gray-400
          rounded-b-lg
        "
        spellCheck={false}
      />
    </div>
  );
}
