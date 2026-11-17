"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { listVideoExtracts, saveVideoExtract } from "@/lib/workflowClient";
import type { VideoExtractRecord, VideoExtractResult } from "@/lib/videoExtract";
import type { Notice } from "./types";

export default function VideoExtractHistory({ result, onNotice }: {
  result: VideoExtractResult | null;
  onNotice: (notice: Notice) => void;
}) {
  const [records, setRecords] = useState<VideoExtractRecord[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const reportError = useCallback((error: unknown) => {
    console.error("[VideoHistory] Request failed", { action: "video.history", error });
    onNotice({ type: "error", message: error instanceof Error ? error.message : "拆片历史读取失败" });
  }, [onNotice]);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listVideoExtracts();
      setRecords(data.records);
      setConfigured(data.configured);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload().catch(reportError); }, [reload, reportError]);
  const save = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await saveVideoExtract(result);
      await reload();
      onNotice({ type: "success", message: "已保存拆片历史" });
    } catch (error) { reportError(error); }
    finally { setSaving(false); }
  };
  return <Card>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-bold text-ink">拆片历史</h3>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" loading={loading} onClick={() => void reload().catch(reportError)}>刷新</Button>
        {result && <Button size="sm" disabled={!configured || loading} loading={saving} onClick={() => void save()}>保存本次拆片</Button>}
      </div>
    </div>
    {!loading && !configured && <p className="mt-3 text-xs text-faint">未配置拆片记录表，本次结果仅保留在当前页面。</p>}
    {!loading && configured && !records.length && <p className="mt-3 text-xs text-faint">还没有拆片记录。</p>}
    <div className="mt-3 space-y-2">{records.map((record) => <details key={record.extractId} className="rounded-xl border border-line p-3">
      <summary className="cursor-pointer text-sm font-semibold text-ink">{record.title || "无标题"} · {record.extractedAt}</summary>
      <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{record.transcript || record.desc || "没有口播原文"}</p>
      <p className="mt-2 text-xs text-faint">{record.analysis.reusableTemplate}</p>
      <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-brand-600">查看来源</a>
    </details>)}</div>
  </Card>;
}
