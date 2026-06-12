"use client";

import { useEffect, useState } from "react";
import { importTopicPool, type TopicPoolImportResult } from "@/lib/workflowClient";

type NoticeType = "success" | "error" | "info";

interface TopicPoolImportPanelProps {
  defaultSourceDir?: string;
  isFeishuReady: boolean;
  onNotice: (notice: { type: NoticeType; message: string }) => void;
  onImported: () => Promise<void>;
}

export default function TopicPoolImportPanel({
  defaultSourceDir = "",
  isFeishuReady,
  onNotice,
  onImported,
}: TopicPoolImportPanelProps) {
  const [sourceDir, setSourceDir] = useState(defaultSourceDir);
  const [previewResult, setPreviewResult] = useState<TopicPoolImportResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!sourceDir && defaultSourceDir) {
      setSourceDir(defaultSourceDir);
    }
  }, [defaultSourceDir, sourceDir]);

  const handlePreview = async () => {
    if (!sourceDir.trim()) {
      onNotice({ type: "error", message: "请先填写内容库目录" });
      return;
    }

    setIsPreviewing(true);
    onNotice({ type: "info", message: "正在解析选题池" });
    try {
      const result = await importTopicPool({ sourceDir, writeBack: false });
      setPreviewResult(result);
      onNotice({
        type: "success",
        message: `解析完成：${result.topics.length} 条选题种子（分区：${result.sections.join("、") || "无"}）。预览不入库，请继续点「导入飞书」`,
      });
    } catch (error) {
      console.error("[TopicPoolImportPanel] 解析失败", { action: "topicPool.preview", error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "选题池解析失败" });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!isFeishuReady) {
      onNotice({ type: "error", message: "当前是 Demo 模式，连接飞书后才能导入选题。" });
      return;
    }
    if (!sourceDir.trim()) {
      onNotice({ type: "error", message: "请先填写内容库目录" });
      return;
    }

    setIsImporting(true);
    onNotice({ type: "info", message: "正在把选题池写入飞书" });
    try {
      const result = await importTopicPool({ sourceDir, writeBack: true });
      setPreviewResult(result);
      onNotice({
        type: "success",
        message: `已导入飞书选题表 ${result.imported.length} 条，跳过重复 ${result.skipped} 条`,
      });
      await onImported();
    } catch (error) {
      console.error("[TopicPoolImportPanel] 导入失败", { action: "topicPool.import", error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "选题池导入失败" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <details className="group border border-stone-300 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-stone-50">
        <div className="flex items-center gap-3">
          <span className="text-stone-400 transition-transform group-open:rotate-90">▸</span>
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-stone-400">Topic Pool Intake</div>
            <div className="text-sm font-black text-stone-950">从选题池导入</div>
          </div>
        </div>
        <span className="text-xs text-stone-500">把内容库「待发酵 / 可启动」选题导进来</span>
      </summary>
      <div className="grid gap-0 border-t border-stone-200 lg:grid-cols-[1.4fr_0.7fr]">
        <div className="border-b border-stone-200 p-4 lg:border-b-0 lg:border-r">
          <label className="block text-xs font-bold text-stone-500">内容库目录</label>
          <input
            value={sourceDir}
            onChange={(event) => setSourceDir(event.target.value)}
            placeholder="如 /Users/you/workspace/content/xhs"
            className="mt-2 w-full border border-stone-300 bg-[#f8f6f1] px-3 py-2 text-sm font-semibold text-stone-900 outline-none focus:border-stone-950"
          />
          <p className="mt-2 text-xs leading-5 text-stone-500">
            读取目录下的 <span className="font-semibold text-stone-700">选题池.md</span>，只导入「待发酵」「可启动」分区，不触碰试水区 / 已发布 / 已废弃。导入为选题种子（状态「待写」），痛点与正文结构留到本环节细化。
          </p>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-2 border border-stone-200 text-center">
            <div className="border-r border-stone-200 p-3">
              <div className="text-xl font-black text-rose-600">{previewResult?.topics.length || 0}</div>
              <div className="text-xs text-stone-500">选题种子</div>
            </div>
            <div className="p-3">
              <div className="text-xl font-black text-teal-700">{previewResult?.imported.length || 0}</div>
              <div className="text-xs text-stone-500">已导入</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handlePreview}
              disabled={isPreviewing || !sourceDir.trim()}
              className="border border-stone-950 bg-white px-3 py-2 text-sm font-black text-stone-950 transition-colors hover:bg-stone-950 hover:text-white disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400"
            >
              {isPreviewing ? "解析中" : "解析预览"}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={isImporting || !isFeishuReady || !sourceDir.trim()}
              className="border border-rose-600 bg-rose-600 px-3 py-2 text-sm font-black text-white transition-colors hover:bg-stone-950 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
            >
              {isImporting ? "导入中" : isFeishuReady ? "导入飞书" : "连接飞书后导入"}
            </button>
          </div>
        </div>
      </div>

      {previewResult && (
        <div className="border-t border-stone-200 p-4">
          <div className="text-xs font-bold text-stone-400">前 6 条选题</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {previewResult.topics.slice(0, 6).map((topic) => (
              <span key={topic.topicId} className="border border-stone-200 bg-[#f8f6f1] px-2 py-1 text-xs font-semibold text-stone-600">
                {topic.titleCandidates[0]}
              </span>
            ))}
            {previewResult.topics.length === 0 && (
              <span className="border border-stone-200 bg-[#f8f6f1] px-2 py-1 text-xs font-semibold text-stone-500">
                未解析到可导入的选题
              </span>
            )}
          </div>
          {!previewResult.writeBack && previewResult.topics.length > 0 && (
            <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
              当前只是解析预览，选题还没有进入飞书。连接飞书后可导入选题表。
            </div>
          )}
        </div>
      )}
    </details>
  );
}
