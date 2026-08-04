"use client";

import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import IntakeShell from "@/components/workflow/IntakeShell";
import Stat from "@/components/ui/Stat";
import DirectoryField from "@/components/workflow/DirectoryField";
import type { LocalDocCategory } from "@/lib/localDocs";
import { scanLocalDocs, syncLocalDocs, type LocalDocsScanResult, type LocalDocsSyncResult } from "@/lib/workflowClient";
import type { Notice } from "./types";

interface LocalDocsSyncPanelProps {
  defaultSourceDir?: string;
  isFeishuReady: boolean;
  onNotice: (notice: Notice) => void;
  onImported: () => Promise<void>;
  headless?: boolean;
}

const CATEGORY_OPTIONS: Array<{
  value: LocalDocCategory;
  label: string;
  description: string;
}> = [
  { value: "daily", label: "日报", description: "里程碑、交付、计划" },
  { value: "issues", label: "问题", description: "踩坑、原因、解法" },
  { value: "glossary", label: "术语", description: "Agent 学习与术语" },
  { value: "standards", label: "标准", description: "流程、约定、SOP" },
];

function getSelectedCategories(selected: Record<LocalDocCategory, boolean>): LocalDocCategory[] {
  return CATEGORY_OPTIONS.filter((item) => selected[item.value]).map((item) => item.value);
}

function categoryLabel(category: LocalDocCategory): string {
  return CATEGORY_OPTIONS.find((item) => item.value === category)?.label || category;
}

function sampleText(result: LocalDocsScanResult | null): string {
  if (!result) return "先扫描本地文档，确认抽取结果后再写入飞书。";
  const material = result.materials[0];
  if (material) return `${material.sourceType}：${material.event}`;
  const glossary = result.glossary[0];
  if (glossary) return `术语：${glossary.term}`;
  return "没有抽取到可入库内容。";
}

export default function LocalDocsSyncPanel({
  defaultSourceDir = "",
  isFeishuReady,
  onNotice,
  onImported,
  headless,
}: LocalDocsSyncPanelProps) {
  const [sourceDir, setSourceDir] = useState(defaultSourceDir);
  const [selected, setSelected] = useState<Record<LocalDocCategory, boolean>>({
    daily: true,
    issues: true,
    glossary: true,
    standards: true,
  });
  const [scanResult, setScanResult] = useState<LocalDocsScanResult | null>(null);
  const [syncResult, setSyncResult] = useState<LocalDocsSyncResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const categories = useMemo(() => getSelectedCategories(selected), [selected]);

  useEffect(() => {
    if (!sourceDir && defaultSourceDir) {
      setSourceDir(defaultSourceDir);
    }
  }, [defaultSourceDir, sourceDir]);

  const handleToggle = (category: LocalDocCategory) => {
    setSelected((current) => ({ ...current, [category]: !current[category] }));
  };

  const handleScan = async () => {
    if (!sourceDir.trim()) {
      onNotice({ type: "error", message: "请先填写本地文档目录" });
      return;
    }

    setIsScanning(true);
    setSyncResult(null);
    onNotice({ type: "info", message: "正在扫描本地协作记录" });
    try {
      const result = await scanLocalDocs({ sourceDir, categories });
      setScanResult(result);
      onNotice({
        type: "success",
        message: `扫描完成：${result.scannedFiles} 个文件，${result.materials.length} 条素材，${result.glossary.length} 条术语。预览不会入库，请继续点「写入飞书」`,
      });
    } catch (error) {
      console.error("[LocalDocsSyncPanel] 扫描失败", { action: "localDocs.scan", error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "本地文档扫描失败" });
    } finally {
      setIsScanning(false);
    }
  };

  const handleImport = async () => {
    if (!isFeishuReady) {
      onNotice({ type: "error", message: "当前是 Demo 模式，连接飞书后才能写入素材库。" });
      return;
    }
    if (!sourceDir.trim()) {
      onNotice({ type: "error", message: "请先填写本地文档目录" });
      return;
    }

    setIsImporting(true);
    onNotice({ type: "info", message: "正在把本地文档写入飞书" });
    try {
      const result = await syncLocalDocs({ sourceDir, categories, writeBack: true });
      setScanResult(result);
      setSyncResult(result);
      onNotice({
        type: "success",
        message: `已写入飞书：${result.importedMaterials.length} 条素材，${result.importedGlossary.length} 条术语`,
      });
      await onImported();
    } catch (error) {
      console.error("[LocalDocsSyncPanel] 写入失败", { action: "localDocs.sync", error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "本地文档写入飞书失败" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <IntakeShell title="本地文档入库" hint="把日报 / 问题 / 术语抽成素材" headless={headless}>
      <div className="grid gap-5 p-5 lg:grid-cols-[1.4fr_0.8fr]">
        <div>
          <DirectoryField
            label="文档目录"
            hint="日报、问题记录、Agent 学习和协作标准都会被抽成可提炼素材"
            value={sourceDir}
            onChange={setSourceDir}
            placeholder="填写你的 Markdown 文档目录"
            onNotice={onNotice}
          />
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {CATEGORY_OPTIONS.map((item) => {
              const isActive = selected[item.value];
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => handleToggle(item.value)}
                  className={`rounded-2xl px-3 py-2.5 text-left transition-all ${
                    isActive ? "bg-ink text-white" : "bg-soft text-muted hover:bg-sunken"
                  }`}
                >
                  <div className="text-sm font-bold">{item.label}</div>
                  <div className={`mt-0.5 text-xs ${isActive ? "text-white/60" : "text-faint"}`}>
                    {item.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex gap-2">
            <Stat value={scanResult?.scannedFiles || 0} label="文件" />
            <Stat value={scanResult?.materials.length || 0} label="素材" tone="brand" />
            <Stat value={scanResult?.glossary.length || 0} label="术语" tone="ok" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={handleScan}
              loading={isScanning}
              disabled={categories.length === 0 || !sourceDir.trim()}
            >
              {isScanning ? "扫描中" : "扫描预览"}
            </Button>
            <Button
              variant="primary"
              onClick={handleImport}
              loading={isImporting}
              disabled={categories.length === 0 || !isFeishuReady || !sourceDir.trim()}
            >
              {isImporting ? "写入中" : isFeishuReady ? "写入飞书" : "先连飞书"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 border-t border-line bg-soft p-5 lg:grid-cols-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">样例</div>
          <div className="mt-2 text-sm leading-6 text-ink">{sampleText(scanResult)}</div>
        </div>
        <div>
          <div className="flex flex-wrap gap-1.5">
            {(scanResult?.files || []).slice(0, 8).map((file) => (
              <Badge key={file.path} tone="outline">
                {categoryLabel(file.category)} · {file.extractedMaterials + file.extractedGlossary}
              </Badge>
            ))}
            {!scanResult && (
              <Badge tone="outline">
                预览会显示前 8 个文件的抽取数量
              </Badge>
            )}
          </div>
          {scanResult && !syncResult && (
            <Callout tone="warn" className="mt-3">
              当前只是扫描预览，素材还没有进入飞书。连接飞书后可写入素材库。
            </Callout>
          )}
          {syncResult && (
            <div className="mt-3 text-xs font-semibold text-faint">
              已跳过重复：{syncResult.skippedMaterials} 条素材，{syncResult.skippedGlossary} 条术语。
            </div>
          )}
        </div>
      </div>
    </IntakeShell>
  );
}
