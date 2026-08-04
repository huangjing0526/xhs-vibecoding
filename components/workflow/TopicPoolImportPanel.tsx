"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import IntakeShell from "@/components/workflow/IntakeShell";
import Stat from "@/components/ui/Stat";
import DirectoryField from "@/components/workflow/DirectoryField";
import { importTopicPool, type TopicPoolImportResult } from "@/lib/workflowClient";
import type { Notice } from "./types";

interface TopicPoolImportPanelProps {
  defaultSourceDir?: string;
  isFeishuReady: boolean;
  onNotice: (notice: Notice) => void;
  onImported: () => Promise<void>;
  headless?: boolean;
}

export default function TopicPoolImportPanel({
  defaultSourceDir = "",
  isFeishuReady,
  onNotice,
  onImported,
  headless,
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
    <IntakeShell title="从选题池导入" hint="把内容库「待发酵 / 可启动」选题导进来" headless={headless}>
      <div className="grid gap-5 p-5 lg:grid-cols-[1.4fr_0.8fr]">
        <DirectoryField
          label="内容库目录"
          hint="读取目录下的 选题池.md，只导入「待发酵」「可启动」分区，不触碰试水区 / 已发布 / 已废弃。导入为选题种子（状态「待写」），痛点与正文结构留到本环节细化。"
          value={sourceDir}
          onChange={setSourceDir}
          placeholder="如 /Users/you/workspace/content/xhs"
          onNotice={onNotice}
        />

        <div>
          <div className="flex gap-2">
            <Stat value={previewResult?.topics.length || 0} label="选题种子" tone="brand" />
            <Stat value={previewResult?.imported.length || 0} label="已导入" tone="ok" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={handlePreview} loading={isPreviewing} disabled={!sourceDir.trim()}>
              {isPreviewing ? "解析中" : "解析预览"}
            </Button>
            <Button
              variant="primary"
              onClick={handleImport}
              loading={isImporting}
              disabled={!isFeishuReady || !sourceDir.trim()}
            >
              {isImporting ? "导入中" : isFeishuReady ? "导入飞书" : "先连飞书"}
            </Button>
          </div>
        </div>
      </div>

      {previewResult && (
        <div className="border-t border-line bg-soft p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">前 6 条选题</div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {previewResult.topics.slice(0, 6).map((topic) => (
              <Badge key={topic.topicId} tone="outline">
                {topic.titleCandidates[0]}
              </Badge>
            ))}
            {previewResult.topics.length === 0 && (
              <Badge tone="outline">
                未解析到可导入的选题
              </Badge>
            )}
          </div>
          {!previewResult.writeBack && previewResult.topics.length > 0 && (
            <Callout tone="warn" className="mt-3">
              当前只是解析预览，选题还没有进入飞书。连接飞书后可导入选题表。
            </Callout>
          )}
        </div>
      )}
    </IntakeShell>
  );
}
