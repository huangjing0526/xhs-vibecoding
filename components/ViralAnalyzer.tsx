"use client";

import { useState } from "react";

interface TitleFormula {
  type: string;
  label: string;
  pattern: RegExp;
  example: string;
  description: string;
}

interface StructurePattern {
  type: string;
  label: string;
  keywords: string[];
  description: string;
}

interface AnalysisResult {
  titleFormula: TitleFormula | null;
  structure: StructurePattern | null;
  emotion: { label: string; emoji: string };
  highlights: string[];
}

const TITLE_FORMULAS: TitleFormula[] = [
  {
    type: "number",
    label: "数字法",
    pattern: /\d+[个条件天分钟元步招式技巧]/,
    example: "3个技巧让你的文案点赞翻倍",
    description: "用具体数字增加可信度和吸引力",
  },
  {
    type: "contrast",
    label: "反差法",
    pattern: /却|但|竟然|没想到|居然|反而|明明.*却|普通.*却|便宜.*好|平价.*高端/,
    example: "人均50块却吃出了高端感",
    description: "制造认知落差，激发好奇心",
  },
  {
    type: "suspense",
    label: "悬念法",
    pattern: /为什么|怎么做到|如何|竟然|原来|真相|秘密|内幕/,
    example: "为什么他三个月涨粉10万？",
    description: "留下问题让读者想知道答案",
  },
  {
    type: "resonance",
    label: "共鸣法",
    pattern: /我们|你是否|有没有|谁懂|有木有|感同身受|一定|都经历/,
    example: "打工人有没有被这件事整崩溃过",
    description: "让目标读者感到被理解",
  },
  {
    type: "negation",
    label: "否定法",
    pattern: /不要|别再|停止|放弃|千万别|错误|不该|踩坑/,
    example: "千万别再这样用AI了，全是坑",
    description: "用否定触发危机感，避免损失心理",
  },
  {
    type: "audience",
    label: "人群定向法",
    pattern: /打工人|学生|宝妈|程序员|姐妹|男生|女生|职场|新手|小白/,
    example: "程序员必看：这个AI工具太香了",
    description: "明确指向目标人群，提升点击率",
  },
];

const STRUCTURE_PATTERNS: StructurePattern[] = [
  {
    type: "story",
    label: "故事型",
    keywords: ["今天", "昨天", "上周", "那次", "记得", "有一次", "突然", "后来", "最后"],
    description: "叙事弧线：起因 → 经过 → 结果",
  },
  {
    type: "howto",
    label: "干货型",
    keywords: ["步骤", "方法", "技巧", "教程", "攻略", "指南", "第一步", "第二步", "首先", "其次"],
    description: "知识结构：背景 → 方法 → 总结",
  },
  {
    type: "review",
    label: "测评型",
    keywords: ["测评", "使用了", "试用", "开箱", "实测", "对比", "优点", "缺点", "总结"],
    description: "测评结构：入坑原因 → 实测 → 结论",
  },
  {
    type: "vlog",
    label: "生活记录型",
    keywords: ["日记", "vlog", "记录", "分享", "日常", "这周", "今日"],
    description: "时间线结构：场景 → 体验 → 感悟",
  },
];

const EMOTION_PATTERNS: { label: string; emoji: string; keywords: string[] }[] = [
  { label: "惊喜", emoji: "🎉", keywords: ["惊了", "绝了", "OMG", "没想到", "太厉害", "amazing", "震惊"] },
  { label: "实用", emoji: "💡", keywords: ["干货", "实用", "有用", "建议收藏", "学到了", "技巧", "方法"] },
  { label: "感动", emoji: "🥺", keywords: ["感动", "暖心", "泪目", "破防了", "哭了", "心疼", "感谢"] },
  { label: "搞笑", emoji: "😂", keywords: ["哈哈", "笑死", "搞笑", "太好笑", "绷不住", "笑喷", "太抽象"] },
  { label: "愤怒", emoji: "😤", keywords: ["气死", "无语", "离谱", "崩溃", "救命", "踩坑", "吐槽"] },
  { label: "温暖", emoji: "🌸", keywords: ["温暖", "治愈", "美好", "幸福", "快乐", "开心", "满足"] },
];

function analyzeText(text: string): AnalysisResult {
  const lower = text;

  // 检测标题公式
  const titleFormula = TITLE_FORMULAS.find((f) => f.pattern.test(lower)) || null;

  // 检测结构模式
  const structureScores = STRUCTURE_PATTERNS.map((s) => ({
    pattern: s,
    score: s.keywords.filter((k) => lower.includes(k)).length,
  }));
  const bestStructure = structureScores.sort((a, b) => b.score - a.score)[0];
  const structure = bestStructure.score > 0 ? bestStructure.pattern : null;

  // 检测情绪基调
  const emotionScores = EMOTION_PATTERNS.map((e) => ({
    emotion: e,
    score: e.keywords.filter((k) => lower.includes(k)).length,
  }));
  const bestEmotion = emotionScores.sort((a, b) => b.score - a.score)[0];
  const emotion =
    bestEmotion.score > 0
      ? { label: bestEmotion.emotion.label, emoji: bestEmotion.emotion.emoji }
      : { label: "平和", emoji: "😌" };

  // 提取亮点
  const highlights: string[] = [];
  if (/\d+/.test(lower)) highlights.push("包含具体数字");
  if (/[？?]/.test(lower)) highlights.push("以问题结尾");
  if (lower.length >= 15 && lower.length <= 25) highlights.push("标题长度适中");
  if (/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u.test(lower)) highlights.push("善用 emoji");
  if (/打工人|学生|宝妈|程序员|姐妹/.test(lower)) highlights.push("明确目标人群");

  return { titleFormula, structure, emotion, highlights };
}

interface ViralAnalyzerProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyFormula?: (formula: string) => void;
}

export default function ViralAnalyzer({ isOpen, onClose, onApplyFormula }: ViralAnalyzerProps) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleAnalyze = () => {
    if (!input.trim()) return;
    setResult(analyzeText(input.trim()));
  };

  const handleApply = () => {
    if (!result) return;
    const parts = [];
    if (result.titleFormula) parts.push(`【${result.titleFormula.label}】${result.titleFormula.description}`);
    if (result.structure) parts.push(`结构：${result.structure.description}`);
    onApplyFormula?.(parts.join(" | "));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">爆款解析</h2>
            <p className="text-xs text-gray-400 mt-0.5">粘贴任意小红书标题或内容，逆向解析爆款公式</p>
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

        <div className="p-5 space-y-4">
          {/* Input */}
          <div>
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); setResult(null); }}
              rows={3}
              placeholder="粘贴标题或正文片段，例如：&#10;人均 200 元竟然吃出了 3 倍的幸福感..."
              className="w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-xhs-red focus:border-transparent resize-none"
            />
            <button
              onClick={handleAnalyze}
              disabled={!input.trim()}
              className="mt-2 w-full py-2.5 bg-gradient-to-r from-xhs-red to-xhs-pink text-white rounded-xl font-medium text-sm disabled:opacity-50 hover:shadow-md transition-all"
            >
              解析爆款公式
            </button>
          </div>

          {/* Results */}
          {result && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* Title Formula */}
              <div className="p-3.5 rounded-xl border bg-orange-50 border-orange-100">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">标题公式</span>
                </div>
                {result.titleFormula ? (
                  <>
                    <p className="text-sm font-medium text-gray-900">
                      <span className="px-2 py-0.5 bg-orange-200 text-orange-800 rounded-full text-xs mr-2">
                        {result.titleFormula.label}
                      </span>
                      {result.titleFormula.description}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">示例：{result.titleFormula.example}</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">未检测到明显标题公式</p>
                )}
              </div>

              {/* Structure */}
              <div className="p-3.5 rounded-xl border bg-blue-50 border-blue-100">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">内容结构</span>
                </div>
                {result.structure ? (
                  <>
                    <p className="text-sm font-medium text-gray-900">
                      <span className="px-2 py-0.5 bg-blue-200 text-blue-800 rounded-full text-xs mr-2">
                        {result.structure.label}
                      </span>
                      {result.structure.description}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">未检测到明显内容结构</p>
                )}
              </div>

              {/* Emotion */}
              <div className="p-3.5 rounded-xl border bg-purple-50 border-purple-100">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">情绪基调</span>
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {result.emotion.emoji} {result.emotion.label}
                </p>
              </div>

              {/* Highlights */}
              {result.highlights.length > 0 && (
                <div className="p-3.5 rounded-xl border bg-green-50 border-green-100">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">亮点要素</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.highlights.map((h) => (
                      <span key={h} className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
                        ✓ {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Apply button */}
              {onApplyFormula && (
                <button
                  onClick={handleApply}
                  className="w-full py-2.5 border-2 border-xhs-red text-xhs-red rounded-xl font-medium text-sm hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  用这个公式重写我的内容
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
