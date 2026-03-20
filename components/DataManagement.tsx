"use client";

import { useState, useRef, useEffect } from "react";
import {
  exportAllData,
  importAllData,
  downloadAsJson,
  validateImportData,
  getDataSummary,
} from "@/lib/dataManager";

interface DataManagementProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: () => void;
}

export default function DataManagement({ isOpen, onClose, onImported }: DataManagementProps) {
  const [summary, setSummary] = useState({ historyCount: 0, hasProfile: false, hasApiConfig: false, hasDraft: false });
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSummary(getDataSummary());
      setImportResult(null);
      setImportError(null);
      setShowClearConfirm(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = () => {
    const data = exportAllData();
    downloadAsJson(data);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!validateImportData(data)) {
          setImportError("文件格式无效，请选择 VibeNote 导出的 JSON 文件");
          return;
        }
        const imported = importAllData(data);
        setImportResult(`成功导入: ${imported.join(", ")}。刷新页面后生效。`);
        setImportError(null);
        setSummary(getDataSummary());
        onImported?.();
      } catch {
        setImportError("文件解析失败，请检查文件格式");
      }
    };
    reader.readAsText(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  const handleClearAll = () => {
    const keys = [
      "vibenote_api_config",
      "vibenote_draft",
      "xhs-user-profile",
      "xhs-content-history",
      "xhs-rich-history",
      "vibenote_onboarding_done",
    ];
    keys.forEach((k) => localStorage.removeItem(k));
    setSummary(getDataSummary());
    setShowClearConfirm(false);
    setImportResult("所有数据已清除。刷新页面后生效。");
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">数据管理</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Data summary */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <h3 className="text-sm font-medium text-gray-700">当前数据</h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
              <span>历史记录</span>
              <span className="text-right font-medium">{summary.historyCount} 条</span>
              <span>用户画像</span>
              <span className="text-right font-medium">{summary.hasProfile ? "已配置" : "默认"}</span>
              <span>API 配置</span>
              <span className="text-right font-medium">{summary.hasApiConfig ? "已配置" : "未配置"}</span>
              <span>草稿</span>
              <span className="text-right font-medium">{summary.hasDraft ? "有" : "无"}</span>
            </div>
          </div>

          {/* Export */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">导出数据</h3>
            <p className="text-xs text-gray-500 mb-3">导出所有数据为 JSON 文件，包括历史记录、用户画像、API 配置和草稿。</p>
            <button
              onClick={handleExport}
              className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              导出为 JSON
            </button>
          </div>

          {/* Import */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">导入数据</h3>
            <p className="text-xs text-gray-500 mb-3">从 JSON 文件恢复数据。注意：将覆盖当前数据。</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={handleImportClick}
              className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              选择 JSON 文件导入
            </button>
          </div>

          {/* Result/Error messages */}
          {importResult && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              {importResult}
            </div>
          )}
          {importError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {importError}
            </div>
          )}

          {/* Clear all */}
          <div className="pt-4 border-t">
            <h3 className="text-sm font-medium text-red-600 mb-2">危险操作</h3>
            {showClearConfirm ? (
              <div className="flex gap-2">
                <button
                  onClick={handleClearAll}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  确认清除所有数据
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors"
              >
                清除所有数据
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
