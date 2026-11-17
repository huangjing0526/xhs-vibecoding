"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clapperboard } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import MobileToolPage from "@/components/mobile/MobileToolPage";
import NotePicker from "@/components/mobile/NotePicker";
import { findDraftForTopic, useWorkflowData } from "@/components/mobile/useWorkflowData";
import { showNotice } from "@/components/mobile/notice";
import VideoStudio from "@/components/workflow/VideoStudio";
import { recallTopic } from "@/lib/mobile/selection";
import { getNoteAssets, saveNoteAssets } from "@/lib/workflowClient";
import type { VideoPlan } from "@/lib/videoWorkflow";
import type { ContentCard } from "@/lib/xhsWorkflow";

export default function MobileVideoPage() {
  const { topics, drafts, loading } = useWorkflowData();
  const [topic, setTopic] = useState<ContentCard | null>(null);
  const [plan, setPlan] = useState<VideoPlan | null>(null);
  const reportError = useCallback((action: string, error: unknown) => {
    console.error("[MobileVideo] Request failed", { action, error });
    showNotice({ type: "error", message: error instanceof Error ? error.message : "视频方案保存失败" });
  }, []);
  useEffect(() => {
    if (topic || !topics.length) return;
    setTopic(topics.find((item) => item.topicId === recallTopic()) ?? topics[0]);
  }, [topic, topics]);
  const topicId = topic?.topicId;
  const activeTopic = useRef(topicId);
  activeTopic.current = topicId;
  useEffect(() => {
    setPlan(null);
    if (!topicId) return;
    let active = true;
    getNoteAssets(topicId).then((assets) => {
      if (active) setPlan(assets.videoPlan ?? null);
    }).catch((error) => reportError("notes.assets.read", error));
    return () => { active = false; };
  }, [topicId, reportError]);
  const savePlan = async (next: VideoPlan) => {
    if (!topicId) return;
    try {
      await saveNoteAssets(topicId, { videoPlan: next });
      if (activeTopic.current === topicId) setPlan(next);
    } catch (error) { reportError("notes.assets.write", error); }
  };
  return (
    <MobileToolPage title="视频脚本" subtitle="口播稿 · 分镜 · 一键成片">
      {!topics.length && !loading ? <EmptyState icon={<Clapperboard size={22} />} title="还没有可用的笔记"
        description="先选择一篇笔记，再生成视频脚本。"
        action={<Link href="/m/t/extract" className="text-sm text-brand-600">去拆片</Link>} /> :
        <div className="space-y-4">
          <NotePicker topics={topics} drafts={drafts} value={topic} onChange={setTopic} />
          <VideoStudio key={topicId} selectedTopic={topic} selectedDraft={findDraftForTopic(drafts, topic)}
            bloggerDistillation={null} plan={plan} onVideoPlanChange={savePlan} onNotice={showNotice} onError={reportError} />
        </div>}
    </MobileToolPage>
  );
}
