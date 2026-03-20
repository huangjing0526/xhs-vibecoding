// 数据导出/导入管理

export interface ExportData {
  version: 1;
  exportedAt: number;
  apiConfig?: any;
  draft?: any;
  userProfile?: any;
  contentHistory?: any;
  richHistory?: any;
}

const STORAGE_KEYS = {
  apiConfig: "vibenote_api_config",
  draft: "vibenote_draft",
  userProfile: "xhs-user-profile",
  contentHistory: "xhs-content-history",
  richHistory: "xhs-rich-history",
} as const;

export function exportAllData(): ExportData {
  const data: ExportData = {
    version: 1,
    exportedAt: Date.now(),
  };

  for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        data[key as keyof Omit<ExportData, "version" | "exportedAt">] = JSON.parse(raw);
      }
    } catch {
      // skip malformed data
    }
  }

  return data;
}

export function importAllData(data: ExportData): string[] {
  const imported: string[] = [];

  for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
    const value = data[key as keyof Omit<ExportData, "version" | "exportedAt">];
    if (value !== undefined) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
        imported.push(key);
      } catch {
        // skip
      }
    }
  }

  return imported;
}

export function downloadAsJson(data: ExportData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vibenote-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function validateImportData(data: unknown): data is ExportData {
  if (!data || typeof data !== "object") return false;
  const d = data as any;
  return d.version === 1 && typeof d.exportedAt === "number";
}

export function getDataSummary(): { historyCount: number; hasProfile: boolean; hasApiConfig: boolean; hasDraft: boolean } {
  let historyCount = 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.richHistory);
    if (raw) historyCount = JSON.parse(raw).length;
  } catch {}

  return {
    historyCount,
    hasProfile: !!localStorage.getItem(STORAGE_KEYS.userProfile),
    hasApiConfig: !!localStorage.getItem(STORAGE_KEYS.apiConfig),
    hasDraft: !!localStorage.getItem(STORAGE_KEYS.draft),
  };
}
