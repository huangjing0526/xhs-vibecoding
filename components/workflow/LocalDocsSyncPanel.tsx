"use client";

import { useEffect, useMemo, useState } from "react";
import type { LocalDocCategory } from "@/lib/localDocs";
import { scanLocalDocs, syncLocalDocs, type LocalDocsScanResult, type LocalDocsSyncResult } from "@/lib/workflowClient";
import type { Notice } from "./types";

interface LocalDocsSyncPanelProps {
  defaultSourceDir?: string;
  isFeishuReady: boolean;
  onNotice: (notice: Notice) => void;
  onImported: () => Promise<void>;
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
    <details className="group border border-stone-300 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-stone-50">
        <div className="flex items-center gap-3">
          <span className="text-stone-400 transition-transform group-open:rotate-90">▸</span>
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-stone-400">Local Docs Intake</div>
            <div className="text-sm font-black text-stone-950">本地文档入库</div>
          </div>
        </div>
        <span className="text-xs text-stone-500">把日报 / 问题 / 术语抽成素材</span>
      </summary>
      <div className="grid gap-0 border-t border-stone-200 lg:grid-cols-[1.4fr_0.7fr]">
        <div className="border-b border-stone-200 p-4 lg:hidden">
          <p className="text-sm leading-6 text-stone-600">把日报、问题记录、Agent 学习和协作标准抽成可提炼素材。</p>
        </div>

        <div className="border-b border-stone-200 p-4 lg:border-b-0 lg:border-r">
          <label className="block text-xs font-bold text-stone-500">文档目录</label>
          <input
            value={sourceDir}
            onChange={(event) => setSourceDir(event.target.value)}
            placeholder="填写你的 Markdown 文档目录"
            className="mt-2 w-full border border-stone-300 bg-[#f8f6f1] px-3 py-2 text-sm font-semibold text-stone-900 outline-none focus:border-stone-950"
          />
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {CATEGORY_OPTIONS.map((item) => {
              const isActive = selected[item.value];
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => handleToggle(item.value)}
                  className={`border px-3 py-2 text-left transition-colors ${
                    isActive
                      ? "border-stone-950 bg-stone-950 text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
                  }`}
                >
                  <div className="text-sm font-black">{item.label}</div>
                  <div className={`mt-1 text-xs ${isActive ? "text-stone-300" : "text-stone-500"}`}>{item.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-3 border border-stone-200 text-center">
            <div className="border-r border-stone-200 p-3">
              <div className="text-xl font-black text-stone-950">{scanResult?.scannedFiles || 0}</div>
              <div className="text-xs text-stone-500">文件</div>
            </div>
            <div className="border-r border-stone-200 p-3">
              <div className="text-xl font-black text-rose-600">{scanResult?.materials.length || 0}</div>
              <div className="text-xs text-stone-500">素材</div>
            </div>
            <div className="p-3">
              <div className="text-xl font-black text-teal-700">{scanResult?.glossary.length || 0}</div>
              <div className="text-xs text-stone-500">术语</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleScan}
              disabled={isScanning || categories.length === 0 || !sourceDir.trim()}
              className="border border-stone-950 bg-white px-3 py-2 text-sm font-black text-stone-950 transition-colors hover:bg-stone-950 hover:text-white disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400"
            >
              {isScanning ? "扫描中" : "扫描预览"}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={isImporting || categories.length === 0 || !isFeishuReady || !sourceDir.trim()}
              className="border border-rose-600 bg-rose-600 px-3 py-2 text-sm font-black text-white transition-colors hover:bg-stone-950 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
            >
              {isImporting ? "写入中" : isFeishuReady ? "写入飞书" : "连接飞书后写入"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid border-t border-stone-200 lg:grid-cols-[1fr_1fr]">
        <div className="border-b border-stone-200 p-4 lg:border-b-0 lg:border-r">
          <div className="text-xs font-bold text-stone-400">样例</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-stone-800">{sampleText(scanResult)}</div>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-2">
            {(scanResult?.files || []).slice(0, 8).map((file) => (
              <span key={file.path} className="border border-stone-200 bg-[#f8f6f1] px-2 py-1 text-xs font-semibold text-stone-600">
                {categoryLabel(file.category)} · {file.extractedMaterials + file.extractedGlossary}
              </span>
            ))}
        {!scanResult && (
          <span className="border border-stone-200 bg-[#f8f6f1] px-2 py-1 text-xs font-semibold text-stone-500">
            预览会显示前 8 个文件的抽取数量
          </span>
        )}
          </div>
          {scanResult && !syncResult && (
            <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
              当前只是扫描预览，素材还没有进入飞书。连接飞书后可写入素材库。
            </div>
          )}
          {syncResult && (
            <div className="mt-3 text-xs font-semibold text-stone-500">
              已跳过重复：{syncResult.skippedMaterials} 条素材，{syncResult.skippedGlossary} 条术语。
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
