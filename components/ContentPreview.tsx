"use client";

import { useState, useEffect } from "react";
import { detectAIFeatures, deAIify, injectHumanImperfections } from "@/lib/antiAI";
import { calculateViralityScore } from "@/lib/ai";
import { diagnoseViralElements, ViralDiagnosis } from "@/lib/viralDiagnostic";

interface ContentPreviewProps {
  title: string;
  titleVariants?: string[];
  titleScores?: number[];
  content: string;
  tags: string[];
  firstComment?: string;
  aiScore: number;
  onContentChange?: (content: string) => void;
  onTitleSelect?: (title: string) => void;
  onRegenerateSection?: (section: "titles" | "body" | "tags" | "comment") => void;
  onRefine?: (section: "content" | "title" | "comment", instruction: string) => void;
}

export default function ContentPreview({
  title,
  titleVariants = [],
  titleScores,
  content,
  tags,
  firstComment,
  aiScore,
  onContentChange,
  onTitleSelect,
  onRegenerateSection,
  onRefine,
}: ContentPreviewProps) {
  const [selectedTitle, setSelectedTitle] = useState(title);
  const [editableContent, setEditableContent] = useState(content);
  const [isEditing, setIsEditing] = useState(false);
  const [copiedSection, setCopiedSection] = useState<"all" | "title" | "body" | "tags" | "comment" | null>(null);
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);
  const [hasEdited, setHasEdited] = useState(false);

  // 当 props 变化时同步内部状态（AI 重新生成/精炼后）
  useEffect(() => {
    setEditableContent(content);
  }, [content]);
  useEffect(() => {
    setSelectedTitle(title);
  }, [title]);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [showRefineBox, setShowRefineBox] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refineTarget, setRefineTarget] = useState<"content" | "title" | "comment">("content");
  const [isRefining, setIsRefining] = useState(false);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [liveAiScore, setLiveAiScore] = useState(aiScore);
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);

  const aiAnalysis = detectAIFeatures(editableContent);

  // P2-1: 实时AI味评分
  useEffect(() => {
    if (hasEdited) {
      const newScore = aiAnalysis.score;
      setLiveAiScore(newScore);
      if (newScore <= 20 && liveAiScore > 20) {
        setShowSuccessAnim(true);
        setTimeout(() => setShowSuccessAnim(false), 2500);
      }
    }
  }, [editableContent, hasEdited]);

  // P1-5: 爆款元素诊断
  const diagnosis: ViralDiagnosis = diagnoseViralElements(selectedTitle, editableContent, tags);

  const displayScore = hasEdited ? liveAiScore : aiScore;

  // P0-1: 一键格式化复制
  const copyToClipboard = async (text: string, section: typeof copiedSection) => {
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleCopyAll = () => {
    const formatted = `${selectedTitle}\n\n${editableContent}\n\n${tags.join(" ")}`;
    copyToClipboard(formatted, "all");
    setShowCopyMenu(false);
  };

  const handleCopyTitle = () => {
    copyToClipboard(selectedTitle, "title");
    setShowCopyMenu(false);
  };

  const handleCopyBody = () => {
    copyToClipboard(editableContent, "body");
    setShowCopyMenu(false);
  };

  const handleCopyTags = () => {
    copyToClipboard(tags.join(" "), "tags");
    setShowCopyMenu(false);
  };

  const handleCopyComment = () => {
    if (firstComment) copyToClipboard(firstComment, "comment");
  };

  const handleDeAIify = () => {
    let processed = deAIify(editableContent);
    processed = injectHumanImperfections(processed);
    setEditableContent(processed);
    setHasEdited(true);
    onContentChange?.(processed);
  };

  const handleTitleSelect = (t: string) => {
    setSelectedTitle(t);
    onTitleSelect?.(t);
  };

  const handleContentEdit = (val: string) => {
    setEditableContent(val);
    setHasEdited(true);
    onContentChange?.(val);
  };

  const handleRefineSubmit = async () => {
    if (!refineInstruction.trim() || !onRefine) return;
    setIsRefining(true);
    await onRefine(refineTarget, refineInstruction);
    setIsRefining(false);
    setRefineInstruction("");
  };

  const getScoreColor = (score: number) => {
    if (score <= 25) return "text-green-600 bg-green-100";
    if (score <= 50) return "text-yellow-600 bg-yellow-100";
    return "text-red-600 bg-red-100";
  };

  const getScoreLabel = (score: number) => {
    if (score <= 25) return "自然";
    if (score <= 50) return "一般";
    return "AI味重";
  };

  const getViralityColor = (score: number) => {
    if (score >= 70) return "bg-green-100 text-green-700 border-green-200";
    if (score >= 50) return "bg-yellow-100 text-yellow-700 border-yellow-200";
    return "bg-red-100 text-red-700 border-red-200";
  };

  const wordCount = editableContent.replace(/\s/g, "").length;

  return (
    <div className="space-y-4" onClick={() => setShowCopyMenu(false)}>
      {/* 标题选择 */}
      {titleVariants.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">选择标题</label>
            {onRegenerateSection && (
              <button
                onClick={(e) => { e.stopPropagation(); onRegenerateSection("titles"); }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-xhs-red transition-colors"
                title="重新生成标题"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                换一批
              </button>
            )}
          </div>
          <div className="space-y-2">
            {titleVariants.map((t, index) => {
              const vs = titleScores ? calculateViralityScore(t) : null;
              return (
                <button
                  key={index}
                  onClick={() => handleTitleSelect(t)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedTitle === t
                      ? "border-xhs-red bg-red-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium flex-1">{t}</span>
                    {vs && (
                      <span
                        className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${getViralityColor(vs.score)}`}
                        title={vs.signals.join(" · ")}
                      >
                        {vs.score}分
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* AI味分析 */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">AI味指数</span>
          <span className={`px-2 py-1 rounded-full text-sm font-medium transition-all ${getScoreColor(displayScore)}`}>
            {displayScore}分 · {getScoreLabel(displayScore)}
          </span>
          {showSuccessAnim && (
            <span className="text-xs text-green-600 font-medium animate-bounce">去AI化成功!</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAIAnalysis(!showAIAnalysis)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {showAIAnalysis ? "收起" : "详细分析"}
          </button>
          <button
            onClick={handleDeAIify}
            className="px-3 py-1 text-sm bg-xhs-red text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            一键去AI化
          </button>
        </div>
      </div>

      {/* P2-1: AI味进度条 */}
      {hasEdited && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              displayScore <= 25 ? "bg-green-500" : displayScore <= 50 ? "bg-yellow-500" : "bg-red-500"
            }`}
            style={{ width: `${Math.max(5, 100 - displayScore)}%` }}
          />
        </div>
      )}

      {/* AI分析详情 */}
      {showAIAnalysis && (
        <div className="p-4 bg-gray-50 rounded-lg space-y-2">
          {aiAnalysis.issues.length > 0 && (
            <div>
              <p className="text-sm font-medium text-red-600 mb-1">问题：</p>
              <ul className="text-sm text-gray-600 list-disc list-inside">
                {aiAnalysis.issues.map((issue, i) => <li key={i}>{issue}</li>)}
              </ul>
            </div>
          )}
          {aiAnalysis.suggestions.length > 0 && (
            <div>
              <p className="text-sm font-medium text-blue-600 mb-1">建议：</p>
              <ul className="text-sm text-gray-600 list-disc list-inside">
                {aiAnalysis.suggestions.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 内容预览/编辑 */}
      <div className="border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
          <span className="text-sm text-gray-600">
            {wordCount} 字
            {wordCount >= 350 && wordCount <= 450 ? (
              <span className="text-green-600 ml-1">✓</span>
            ) : wordCount < 350 ? (
              <span className="text-yellow-600 ml-2">（建议350字以上）</span>
            ) : (
              <span className="text-yellow-600 ml-2">（建议450字以内）</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {onRegenerateSection && (
              <button
                onClick={() => onRegenerateSection("body")}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-xhs-red transition-colors"
                title="重新生成正文"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                换一版
              </button>
            )}
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {isEditing ? "完成" : "编辑"}
            </button>
          </div>
        </div>

        {isEditing ? (
          <textarea
            value={editableContent}
            onChange={(e) => handleContentEdit(e.target.value)}
            className="w-full p-4 min-h-[300px] resize-none focus:outline-none"
          />
        ) : (
          <div className="p-4 whitespace-pre-wrap text-gray-800 leading-relaxed min-h-[300px]">
            {editableContent}
          </div>
        )}
      </div>

      {/* 标签 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">话题标签</span>
          {onRegenerateSection && (
            <button
              onClick={() => onRegenerateSection("tags")}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-xhs-red transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              换标签
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, index) => (
            <span key={index} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* 评论区预埋 */}
      {firstComment && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-yellow-800">评论区预埋（发布后自己评论）</p>
            <button
              onClick={handleCopyComment}
              className="text-yellow-600 hover:text-yellow-800 transition-colors"
              title="复制评论"
            >
              {copiedSection === "comment" ? (
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-gray-700">{firstComment}</p>
        </div>
      )}

      {/* P1-5: 爆款元素诊断 */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowDiagnostic(!showDiagnostic)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">爆款元素诊断</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              diagnosis.passCount >= 4 ? "bg-green-100 text-green-700"
              : diagnosis.passCount >= 3 ? "bg-yellow-100 text-yellow-700"
              : "bg-red-100 text-red-700"
            }`}>
              {diagnosis.passCount}/{diagnosis.totalCount}
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${showDiagnostic ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showDiagnostic && (
          <div className="p-4 space-y-2">
            {diagnosis.dimensions.map((dim) => (
              <div key={dim.key} className="flex items-start gap-3">
                <span className={`mt-0.5 shrink-0 text-base ${dim.pass ? "text-green-500" : "text-red-400"}`}>
                  {dim.pass ? "✅" : "❌"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${dim.pass ? "text-green-700" : "text-red-600"}`}>
                      {dim.label}
                    </span>
                    {!dim.pass && (
                      <span className="text-xs text-gray-500">→ {dim.tip}</span>
                    )}
                  </div>
                  {!dim.pass && (
                    <p className="text-xs text-gray-400 mt-0.5">{dim.example}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* P1-4: AI 追问精炼 */}
      {onRefine && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowRefineBox(!showRefineBox)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-xhs-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">继续告诉 AI 来改稿</span>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${showRefineBox ? "rotate-180" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showRefineBox && (
            <div className="p-4 space-y-3">
              {/* 修改对象 */}
              <div className="flex gap-2">
                {(["content", "title", "comment"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setRefineTarget(t)}
                    className={`px-3 py-1 rounded-full text-xs transition-colors ${
                      refineTarget === t
                        ? "bg-xhs-red text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {t === "content" ? "正文" : t === "title" ? "标题" : "评论"}
                  </button>
                ))}
              </div>

              {/* 快捷指令 */}
              <div className="flex flex-wrap gap-1.5">
                {["更口语化一点", "加一个转折", "改成幽默风格", "加入数字", "更有共鸣"].map((hint) => (
                  <button
                    key={hint}
                    onClick={() => setRefineInstruction(hint)}
                    className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    {hint}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={refineInstruction}
                  onChange={(e) => setRefineInstruction(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRefineSubmit()}
                  placeholder="告诉AI怎么改，例如：更口语化一点..."
                  className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-xhs-red/30 focus:border-xhs-red"
                />
                <button
                  onClick={handleRefineSubmit}
                  disabled={isRefining || !refineInstruction.trim()}
                  className="px-4 py-2 bg-xhs-red text-white rounded-lg text-sm hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center gap-1"
                >
                  {isRefining ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : "发送"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* P0-1: 一键复制（小红书格式） */}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-2">
          <button
            onClick={handleCopyAll}
            className="flex-1 py-3 bg-xhs-red text-white rounded-xl font-medium hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
          >
            {copiedSection === "all" ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                已复制到剪贴板
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                一键复制（小红书格式）
              </>
            )}
          </button>

          {/* 分步复制下拉 */}
          <button
            onClick={() => setShowCopyMenu(!showCopyMenu)}
            className="px-3 py-3 border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
            title="分步复制"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {showCopyMenu && (
          <div className="absolute bottom-full right-0 mb-2 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
            {[
              { label: "仅复制标题", action: handleCopyTitle, section: "title" as const },
              { label: "仅复制正文", action: handleCopyBody, section: "body" as const },
              { label: "仅复制标签", action: handleCopyTags, section: "tags" as const },
            ].map((item) => (
              <button
                key={item.section}
                onClick={item.action}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                {copiedSection === item.section ? (
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
