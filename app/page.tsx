"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import MarkdownUploader from "@/components/MarkdownUploader";
import MarkdownEditor from "@/components/MarkdownEditor";
import CoverEditor from "@/components/CoverEditor";
import { CoverConfig, DEFAULT_COVER_CONFIG } from "@/lib/cover";
import ContentPreview from "@/components/ContentPreview";
import PublishTimeHint from "@/components/PublishTimeHint";
import PersonaSettings from "@/components/PersonaSettings";
import TagRecommender from "@/components/TagRecommender";
import VibeNoteLogo from "@/components/VibeNoteLogo";
import ApiSettings from "@/components/ApiSettings";
import { parseMarkdown, extractTitle, extractMood, ParsedMarkdown } from "@/lib/markdown";
import { analyzeEmotionArc } from "@/lib/emotionEngine";
import { UserProfile, loadProfile } from "@/lib/personalization";
import { checkSimilarity, loadContentHistory, saveToContentHistory } from "@/lib/similarity";
import { buildPrompt, ContentType, CONTENT_TYPE_CONFIGS } from "@/lib/ai";
import OnboardingWizard, { shouldShowOnboarding, SAMPLE_MARKDOWN } from "@/components/OnboardingWizard";
import HistoryDrawer from "@/components/HistoryDrawer";
import { saveRichHistoryEntry, HistoryEntry } from "@/lib/similarity";
import ViralAnalyzer from "@/components/ViralAnalyzer";
import XHSPhonePreview from "@/components/XHSPhonePreview";

interface GeneratedContent {
  title: string;
  titleVariants: string[];
  content: string;
  tags: string[];
  firstComment: string;
  aiScore: number;
  titleScores?: number[];
}

interface Draft {
  markdownContent: string;
  contentType: ContentType;
  generatedContent: GeneratedContent | null;
  selectedTitle: string;
}

const CONTENT_TYPES = (Object.entries(CONTENT_TYPE_CONFIGS) as [ContentType, typeof CONTENT_TYPE_CONFIGS[ContentType]][]);

export default function Home() {
  const [markdownContent, setMarkdownContent] = useState("");
  const [parsedContent, setParsedContent] = useState<ParsedMarkdown | null>(null);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingPhase, setGeneratingPhase] = useState("");
  const [activeTab, setActiveTab] = useState<"input" | "output">("input");
  const [selectedTitle, setSelectedTitle] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [similarityWarning, setSimilarityWarning] = useState<string | null>(null);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [contentType, setContentType] = useState<ContentType>("vibecoding");

  // P0-4: 新用户引导
  const [hasApiConfig, setHasApiConfig] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // P0-5: 草稿恢复
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 情绪弧线展示
  const [emotionArcLabel, setEmotionArcLabel] = useState<string>("");

  // P2-2: 历史抽屉
  const [showHistory, setShowHistory] = useState(false);

  // P2-4: 爆款解析
  const [showViralAnalyzer, setShowViralAnalyzer] = useState(false);

  // P2-3: 手机预览
  const [showPhonePreview, setShowPhonePreview] = useState(false);
  const [coverDataUrl, setCoverDataUrl] = useState("");
  const [coverConfig, setCoverConfig] = useState<CoverConfig>({ ...DEFAULT_COVER_CONFIG });

  // 流式生成 & Toast
  const [streamingText, setStreamingText] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Mount: 检查 API 配置 + 草稿 + 新手引导
  useEffect(() => {
    const apiConfig = localStorage.getItem("vibenote_api_config");
    setHasApiConfig(!!apiConfig);

    // P1-3: 新手引导
    if (shouldShowOnboarding()) {
      setShowOnboarding(true);
    }

    const draftRaw = localStorage.getItem("vibenote_draft");
    if (draftRaw) {
      try {
        const draft: Draft = JSON.parse(draftRaw);
        if (draft.markdownContent || draft.generatedContent) {
          setPendingDraft(draft);
          setShowDraftBanner(true);
        }
      } catch {
        // ignore malformed draft
      }
    }
  }, []);

  // P0-5: 草稿自动保存（500ms debounce）
  useEffect(() => {
    if (!markdownContent && !generatedContent) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const draft: Draft = { markdownContent, contentType, generatedContent, selectedTitle };
      localStorage.setItem("vibenote_draft", JSON.stringify(draft));
    }, 500);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [markdownContent, contentType, generatedContent, selectedTitle]);

  const handleRestoreDraft = () => {
    if (!pendingDraft) return;
    if (pendingDraft.markdownContent) {
      setMarkdownContent(pendingDraft.markdownContent);
      const parsed = parseMarkdown(pendingDraft.markdownContent);
      setParsedContent(parsed);
    }
    if (pendingDraft.contentType) setContentType(pendingDraft.contentType);
    if (pendingDraft.generatedContent) {
      setGeneratedContent(pendingDraft.generatedContent);
      setSelectedTitle(pendingDraft.selectedTitle || pendingDraft.generatedContent.title);
    }
    setShowDraftBanner(false);
    setPendingDraft(null);
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem("vibenote_draft");
    setShowDraftBanner(false);
    setPendingDraft(null);
  };

  // 处理Markdown上传
  const handleMarkdownUpload = useCallback((content: string, _filename: string) => {
    setMarkdownContent(content);
    const parsed = parseMarkdown(content);
    setParsedContent(parsed);
    // P0-6: 情绪弧线检测
    if (parsed.emotionWords.length > 0) {
      const arc = analyzeEmotionArc(parsed.emotionWords);
      if (arc.dominantEmotion !== "neutral") {
        const stageLabels = arc.stages.map((s) => {
          const labels: Record<string, string> = {
            frustration: "挫折感", achievement: "成就感",
            excitement: "兴奋感", curiosity: "好奇心",
            struggle: "挣扎感",
          };
          return labels[s.emotion] || s.emotion;
        });
        setEmotionArcLabel(stageLabels.join(" → "));
      } else {
        setEmotionArcLabel("");
      }
    }
  }, []);

  // 处理Markdown编辑
  const handleMarkdownChange = useCallback((content: string) => {
    setMarkdownContent(content);
    if (content.trim()) {
      const parsed = parseMarkdown(content);
      setParsedContent(parsed);
      // P0-6: 情绪弧线检测
      if (parsed.emotionWords.length > 0) {
        const arc = analyzeEmotionArc(parsed.emotionWords);
        if (arc.dominantEmotion !== "neutral") {
          const stageLabels = arc.stages.map((s) => {
            const labels: Record<string, string> = {
              frustration: "挫折感", achievement: "成就感",
              excitement: "兴奋感", curiosity: "好奇心",
              struggle: "挣扎感",
            };
            return labels[s.emotion] || s.emotion;
          });
          setEmotionArcLabel(stageLabels.join(" → "));
        } else {
          setEmotionArcLabel("");
        }
      } else {
        setEmotionArcLabel("");
      }
    } else {
      setParsedContent(null);
      setEmotionArcLabel("");
    }
  }, []);

  // 生成内容（SSE 流式）
  const handleGenerate = async () => {
    if (!parsedContent) return;

    setIsGenerating(true);
    setStreamingText("");
    setSimilarityWarning(null);
    setGeneratingPhase("构思标题中...");
    setActiveTab("output"); // 立即切换到输出页

    const phases = ["构思标题中...", "撰写正文中...", "推荐话题标签...", "生成互动评论..."];
    let phaseIdx = 0;
    const phaseTimer = setInterval(() => {
      phaseIdx = (phaseIdx + 1) % phases.length;
      setGeneratingPhase(phases[phaseIdx]);
    }, 3000);

    try {
      const currentProfile = profile || loadProfile();
      const apiConfig = localStorage.getItem("vibenote_api_config");

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildPrompt(parsedContent, currentProfile, contentType),
          config: apiConfig ? JSON.parse(apiConfig) : undefined,
        }),
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "生成失败");
      }

      // 读取 SSE 流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          let event: any;
          try {
            event = JSON.parse(part.slice(6));
          } catch {
            continue;
          }

          if (event.type === "chunk") {
            setStreamingText((prev) => prev + event.text);
          } else if (event.type === "done") {
            const data: GeneratedContent = event.result;
            setGeneratedContent(data);
            setSelectedTitle(data.title);
            setStreamingText("");
            localStorage.removeItem("vibenote_draft");

            const history = loadContentHistory();
            const similarity = checkSimilarity(data.content, history);
            if (!similarity.isUnique) {
              setSimilarityWarning(
                `内容与历史记录相似度较高 (${similarity.score}分)，建议添加更多个人特色`
              );
            }
            saveToContentHistory(data.content);
            saveRichHistoryEntry({
              title: data.title,
              content: data.content,
              tags: data.tags || [],
              contentType,
            });
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    } catch (error: any) {
      console.error("Generate error:", error);
      showToast(error.message || "生成失败，请重试", "error");
      setStreamingText("");
    } finally {
      clearInterval(phaseTimer);
      setIsGenerating(false);
      setGeneratingPhase("");
    }
  };

  // 读取 SSE 流，返回 done 事件中的 result
  const fetchSSE = useCallback(async (prompt: string): Promise<any> => {
    const apiConfig = localStorage.getItem("vibenote_api_config");
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        config: apiConfig ? JSON.parse(apiConfig) : undefined,
      }),
    });
    if (!response.ok || !response.body) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "请求失败");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        let event: any;
        try { event = JSON.parse(part.slice(6)); } catch { continue; }
        if (event.type === "done") return event.result;
        if (event.type === "error") throw new Error(event.message);
      }
    }
    throw new Error("未收到生成结果");
  }, []);

  // 局部重生成（P1-1）
  const handleRegenerateSection = async (
    section: "titles" | "body" | "tags" | "comment",
    currentContent: GeneratedContent
  ) => {
    if (!parsedContent) return;
    const currentProfile = profile || loadProfile();

    let prompt = "";
    if (section === "titles") {
      const { buildTitleOnlyPrompt } = await import("@/lib/ai");
      prompt = buildTitleOnlyPrompt(parsedContent, currentProfile, contentType, currentContent.content);
    } else if (section === "body") {
      const { buildBodyOnlyPrompt } = await import("@/lib/ai");
      prompt = buildBodyOnlyPrompt(parsedContent, currentProfile, contentType, selectedTitle);
    } else if (section === "tags") {
      const { buildTagsOnlyPrompt } = await import("@/lib/ai");
      prompt = buildTagsOnlyPrompt(contentType, selectedTitle, currentContent.content);
    }

    if (!prompt) return;

    try {
      const data = await fetchSSE(prompt);
      if (section === "titles") {
        setGeneratedContent((prev) =>
          prev ? { ...prev, title: data.title || prev.title, titleVariants: data.titleVariants || prev.titleVariants } : prev
        );
      } else if (section === "body") {
        setGeneratedContent((prev) => prev ? { ...prev, content: data.content || prev.content } : prev);
      } else if (section === "tags") {
        setGeneratedContent((prev) => prev ? { ...prev, tags: data.tags || prev.tags } : prev);
      }
    } catch (e: any) {
      showToast(e.message || "重新生成失败", "error");
    }
  };

  // AI 精炼（P1-4）
  const handleRefine = async (
    section: "content" | "title" | "comment",
    instruction: string
  ) => {
    if (!generatedContent) return;
    const { buildRefinePrompt } = await import("@/lib/ai");
    const currentContent =
      section === "content" ? generatedContent.content
      : section === "title" ? selectedTitle
      : generatedContent.firstComment || "";

    const prompt = buildRefinePrompt(section, currentContent, instruction);

    try {
      const data = await fetchSSE(prompt);
      if (section === "content" && data.content) {
        setGeneratedContent((prev) => prev ? { ...prev, content: data.content } : prev);
      } else if (section === "title" && data.title) {
        setSelectedTitle(data.title);
        setGeneratedContent((prev) =>
          prev ? { ...prev, title: data.title, titleVariants: prev.titleVariants.map((t, i) => i === 0 ? data.title : t) } : prev
        );
      } else if (section === "comment" && data.firstComment) {
        setGeneratedContent((prev) => prev ? { ...prev, firstComment: data.firstComment } : prev);
      }
    } catch (e: any) {
      showToast(e.message || "精炼失败", "error");
    }
  };

  const title = parsedContent ? extractTitle(parsedContent) : "";
  const mood = parsedContent ? extractMood(parsedContent) : "neutral";

  // 初始化封面标题（仅在用户未手动修改过封面标题时）
  useEffect(() => {
    if (title && coverConfig.title === DEFAULT_COVER_CONFIG.title) {
      setCoverConfig((prev) => ({ ...prev, title }));
    }
  }, [title]);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* P0-4: 新用户引导横幅 */}
      {!hasApiConfig && (
        <div className="bg-blue-600 text-white px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <p className="text-sm">
              欢迎使用 VibeNote！开始前需配置 AI API Key —— 推荐硅基流动，注册即送免费额度。
            </p>
            <button
              onClick={() => setShowApiSettings(true)}
              className="shrink-0 px-4 py-1.5 bg-white text-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors"
            >
              立即配置 →
            </button>
          </div>
        </div>
      )}

      {/* P0-5: 草稿恢复横幅 */}
      {showDraftBanner && (
        <div className="bg-orange-50 border-b border-orange-200 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <p className="text-sm text-orange-800">
              发现上次未完成的草稿，是否恢复？
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleRestoreDraft}
                className="px-3 py-1 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 transition-colors"
              >
                恢复
              </button>
              <button
                onClick={handleDiscardDraft}
                className="px-3 py-1 text-orange-700 hover:bg-orange-100 rounded-lg text-sm transition-colors"
              >
                丢弃
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 头部 */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-xhs-red/20 to-xhs-pink/20 rounded-2xl blur-lg group-hover:blur-xl transition-all"></div>
                <div className="relative bg-white rounded-2xl p-2.5 shadow-lg border border-gray-100">
                  <VibeNoteLogo size={48} />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-xhs-red via-red-500 to-xhs-pink bg-clip-text text-transparent">
                  VibeNote
                </h1>
                <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                  你的爆款笔记
                  <span className="inline-block">✨</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* 帮助/新手引导 */}
              <button
                onClick={() => setShowOnboarding(true)}
                className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="使用帮助"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>

              {/* 爆款解析按钮 */}
              <button
                onClick={() => setShowViralAnalyzer(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg text-gray-600 hover:text-gray-900 border-gray-200 hover:border-gray-300 transition-colors"
                title="爆款解析"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span>解析</span>
              </button>

              {/* 历史记录按钮 */}
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg text-gray-600 hover:text-gray-900 border-gray-200 hover:border-gray-300 transition-colors"
                title="历史记录"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>历史</span>
              </button>

              {/* API 配置按钮 */}
              <button
                onClick={() => setShowApiSettings(true)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                  hasApiConfig
                    ? "text-gray-600 hover:text-gray-900 border-gray-200 hover:border-gray-300"
                    : "text-red-600 border-red-200 hover:border-red-300 bg-red-50"
                }`}
                title="配置 AI API"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{hasApiConfig ? "API 配置" : "配置 API"}</span>
              </button>

              {/* 标签页切换 */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab("input")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === "input"
                      ? "bg-white text-gray-900 shadow"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  编辑内容
                </button>
                <button
                  onClick={() => setActiveTab("output")}
                  disabled={!generatedContent && !isGenerating}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === "output"
                      ? "bg-white text-gray-900 shadow"
                      : "text-gray-600 hover:text-gray-900"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  预览导出
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "input" ? (
          <div className="space-y-6">
            {/* 上方：封面编辑 */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="font-semibold text-gray-900 mb-4">封面编辑</h2>
              <CoverEditor
                config={coverConfig}
                onConfigChange={setCoverConfig}
                suggestedTitle={selectedTitle}
                onCoverGenerated={setCoverDataUrl}
              />
            </div>

            {/* P0-2: 内容类型选择器 */}
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <h2 className="font-semibold text-gray-900 mb-3 text-sm">内容类型</h2>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {CONTENT_TYPES.map(([type, cfg]) => (
                  <button
                    key={type}
                    onClick={() => setContentType(type)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all shrink-0 ${
                      contentType === type
                        ? "bg-gradient-to-r from-xhs-red to-xhs-pink text-white shadow-md"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    <span>{cfg.icon}</span>
                    <span>{cfg.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 下方：Markdown输入 & 人设配置 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Markdown输入 */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900">Markdown 输入</h2>
                    {/* P0-6: 情绪弧线标签 */}
                    {emotionArcLabel && (
                      <span className="text-xs px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full border border-purple-100">
                        检测到情绪：{emotionArcLabel}
                      </span>
                    )}
                  </div>

                  {/* 上传区 */}
                  <div className="p-4 border-b">
                    <MarkdownUploader onUpload={handleMarkdownUpload} />
                  </div>

                  {/* 编辑器 */}
                  <div className="h-[400px]">
                    <MarkdownEditor
                      value={markdownContent}
                      onChange={handleMarkdownChange}
                    />
                  </div>
                </div>
              </div>

              {/* 右侧：人设配置 & 控制 */}
              <div className="space-y-6">
                {/* 人设配置 */}
                <PersonaSettings onProfileUpdate={setProfile} />

                {/* 发布时间提示 */}
                <PublishTimeHint />

                {/* 生成进度条 */}
                {isGenerating && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{generatingPhase}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-xhs-red to-xhs-pink rounded-full animate-pulse" style={{ width: "70%" }} />
                    </div>
                  </div>
                )}

                {/* 生成按钮 */}
                <button
                  onClick={handleGenerate}
                  disabled={!parsedContent || isGenerating}
                  className="w-full py-4 bg-gradient-to-r from-xhs-red to-xhs-pink text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {generatingPhase || "AI 正在创作中..."}
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      一键生成小红书内容
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* 输出预览 */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左侧：封面 */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <h2 className="font-semibold text-gray-900 mb-4">封面预览</h2>
                {generatedContent ? (
                  <CoverEditor
                    config={coverConfig}
                    onConfigChange={setCoverConfig}
                    suggestedTitle={selectedTitle}
                    onCoverGenerated={setCoverDataUrl}
                  />
                ) : (
                  <div className="aspect-[3/4] bg-gray-100 rounded-xl animate-pulse flex items-center justify-center">
                    <span className="text-gray-400 text-sm">封面预览</span>
                  </div>
                )}
              </div>
            </div>

            {/* 右侧：文案 */}
            <div className="space-y-6">
              {isGenerating ? (
                /* 流式生成中 */
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-3">
                    <div className="flex gap-1">
                      {[0, 150, 300].map((delay) => (
                        <div
                          key={delay}
                          className="w-2 h-2 bg-xhs-red rounded-full animate-bounce"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-gray-500">{generatingPhase || "AI 正在创作中..."}</span>
                    {streamingText && (
                      <span className="ml-auto text-xs text-gray-400">{streamingText.length} 字符</span>
                    )}
                  </div>
                  <div className="p-4 min-h-[400px] font-mono text-xs text-gray-600 bg-gray-50 overflow-auto leading-relaxed">
                    {streamingText ? (
                      <>
                        <span className="whitespace-pre-wrap">{streamingText}</span>
                        <span className="inline-block w-1.5 h-[14px] bg-xhs-red/70 animate-pulse ml-0.5 align-bottom" />
                      </>
                    ) : (
                      <span className="text-gray-400">正在连接 AI...</span>
                    )}
                  </div>
                </div>
              ) : generatedContent ? (
                <>
                  {/* 相似度警告 */}
                  {similarityWarning && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                      <div className="flex items-center gap-2 text-yellow-800">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="text-sm">{similarityWarning}</span>
                      </div>
                    </div>
                  )}

                  <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-semibold text-gray-900">文案预览</h2>
                      <button
                        onClick={() => setShowPhonePreview(true)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        手机预览
                      </button>
                    </div>
                    <ContentPreview
                      title={generatedContent.title}
                      titleVariants={generatedContent.titleVariants}
                      titleScores={generatedContent.titleScores}
                      content={generatedContent.content}
                      tags={generatedContent.tags}
                      firstComment={generatedContent.firstComment}
                      aiScore={generatedContent.aiScore}
                      onContentChange={(content) =>
                        setGeneratedContent((prev) => prev ? { ...prev, content } : prev)
                      }
                      onTitleSelect={setSelectedTitle}
                      onRegenerateSection={(section) => handleRegenerateSection(section, generatedContent)}
                      onRefine={handleRefine}
                    />
                  </div>

                  {/* 标签管理 */}
                  <div className="bg-white rounded-xl shadow-sm border p-4">
                    <TagRecommender
                      suggestedTags={generatedContent.tags}
                      onTagsChange={(tags) =>
                        setGeneratedContent((prev) => prev ? { ...prev, tags } : null)
                      }
                    />
                  </div>

                  {/* 发布时间提示 */}
                  <PublishTimeHint />

                  {/* 返回编辑 */}
                  <button
                    onClick={() => setActiveTab("input")}
                    className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                  >
                    返回编辑
                  </button>
                </>
              ) : (
                /* 空状态 */
                <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
                  <p className="text-gray-400 text-sm">请先在「编辑内容」中输入内容并点击生成</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* API 配置模态框 */}
      <ApiSettings
        isOpen={showApiSettings}
        onClose={() => setShowApiSettings(false)}
        onConfigSaved={() => setHasApiConfig(true)}
      />

      {/* P1-3: 新手引导向导 */}
      {showOnboarding && (
        <OnboardingWizard
          onComplete={() => setShowOnboarding(false)}
          onOpenApiSettings={() => setShowApiSettings(true)}
          onLoadExample={() => {
            handleMarkdownChange(SAMPLE_MARKDOWN);
            setShowOnboarding(false);
          }}
        />
      )}

      {/* P2-3: 手机外壳预览 */}
      {generatedContent && (
        <XHSPhonePreview
          isOpen={showPhonePreview}
          onClose={() => setShowPhonePreview(false)}
          title={selectedTitle || generatedContent.title}
          content={generatedContent.content}
          tags={generatedContent.tags}
          coverUrl={coverDataUrl}
        />
      )}

      {/* P2-4: 爆款解析 */}
      <ViralAnalyzer
        isOpen={showViralAnalyzer}
        onClose={() => setShowViralAnalyzer(false)}
        onApplyFormula={(formula) => {
          // 将公式提示追加到 markdown 编辑区末尾，作为生成提示
          const hint = `\n\n<!-- 爆款公式参考: ${formula} -->`;
          setMarkdownContent((prev) => prev + hint);
          setActiveTab("input");
        }}
      />

      {/* Toast 通知 */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${
            toast.type === "error"
              ? "bg-red-600 text-white"
              : "bg-gray-900 text-white"
          }`}
        >
          {toast.type === "error" ? (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {toast.message}
        </div>
      )}

      {/* P2-2: 历史记录抽屉 */}
      <HistoryDrawer
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onReuse={(entry: HistoryEntry) => {
          // 加载历史内容回编辑器（标题填入markdown frontmatter）
          const md = `---\ntitle: ${entry.title}\n---\n\n${entry.content}`;
          handleMarkdownChange(md);
          if (entry.contentType) setContentType(entry.contentType as ContentType);
          setActiveTab("input");
        }}
      />
    </main>
  );
}
