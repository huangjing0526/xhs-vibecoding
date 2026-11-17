"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { COLLECT_PLATFORMS, COLLECT_PLATFORM_LABEL, type CollectPlatform } from "@/lib/collector";
import { collectBloggerNotes, collectBloggerProfile, saveBloggerData } from "@/lib/workflowClient";
import type { BloggerNote, BloggerProfile } from "@/lib/bloggerWorkflow";
import type { Notice } from "./types";

export default function BloggerCollector({ configured, onSaved, onNotice, onError }: {
  configured: boolean;
  onSaved: (profile: BloggerProfile, notes: BloggerNote[]) => void;
  onNotice: (notice: Notice) => void;
  onError: (action: string, error: unknown) => void;
}) {
  const [platform, setPlatform] = useState<CollectPlatform>("xiaohongshu");
  const [homeUrl, setHomeUrl] = useState("");
  const [limit, setLimit] = useState("");
  const [score, setScore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ profile: BloggerProfile; notes: BloggerNote[] } | null>(null);

  const collect = async (notes: boolean) => {
    setBusy(true);
    setResult(null);
    try {
      const data = notes
        ? await collectBloggerNotes({ platform, homeUrl, ...(limit ? { limit: Number(limit) } : {}), score })
        : { ...await collectBloggerProfile({ platform, homeUrl }), notes: [] };
      setResult(data);
      onNotice({ type: "success", message: `已读取账号，采集 ${data.notes.length} 条样本` });
    } catch (error) {
      onError("blogger.collect", error);
    } finally { setBusy(false); }
  };
  const save = async () => {
    if (!result) return;
    setBusy(true);
    try {
      await saveBloggerData(result);
      onSaved(result.profile, result.notes);
      onNotice({ type: "success", message: "已保存到对标库，可继续蒸馏" });
    } catch (error) { onError("blogger.save", error); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <h3 className="text-sm font-bold text-ink">账号采集</h3>
      <div className="mt-3 grid items-end gap-3 md:grid-cols-[10rem_1fr_8rem]">
        <Field label="平台"><Select value={platform} onChange={(event) => setPlatform(event.target.value as CollectPlatform)}>
          {COLLECT_PLATFORMS.map((id) => <option key={id} value={id}>{COLLECT_PLATFORM_LABEL[id]}</option>)}
        </Select></Field>
        <Field label="账号主页"><Input value={homeUrl} onChange={(event) => setHomeUrl(event.target.value)} /></Field>
        <Field label="笔记数量（可选）"><Input type="number" value={limit} onChange={(event) => setLimit(event.target.value)} /></Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={score} onChange={(event) => setScore(event.target.checked)} />分析爆款信号</label>
        <Button variant="secondary" disabled={busy || !homeUrl.trim()} onClick={() => void collect(false)}>读取账号</Button>
        <Button variant="primary" loading={busy} disabled={!homeUrl.trim()} onClick={() => void collect(true)}>采集笔记</Button>
      </div>
      {result && <div className="mt-4 border-t border-line pt-3">
        <p className="text-sm font-bold text-ink">{result.profile.name || "未获取昵称"} · {result.notes.length} 条样本</p>
        <ul className="mt-2 max-h-48 space-y-2 overflow-auto text-xs text-muted">{result.notes.map((note) => <li key={note.id}>{note.title || "无标题"}{note.analysis ? ` · 潜力 ${note.analysis.viralityScore}` : ""}</li>)}</ul>
        <Button className="mt-3" disabled={!configured || busy} onClick={() => void save()}>保存到对标库</Button>
      </div>}
      <p className="mt-3 text-xs text-faint">需启动本地采集服务。{configured ? "保存后与手动录入共用账号和样本。" : "未配置对标表，结果仅供预览。"}</p>
    </Card>
  );
}
