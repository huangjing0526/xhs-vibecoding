"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import MobileTabHeader from "@/components/mobile/MobileTabHeader";
import { useWorkflowData } from "@/components/mobile/useWorkflowData";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import { getNoteStatus, noteTitle } from "@/components/workflow/NoteList";
import { rememberTopic, recallTopic } from "@/lib/mobile/selection";
import { isPublishedDraft } from "@/lib/xhsWorkflow";

type WorksTab = "notes" | "published" | "metrics";

const TABS = [
  { value: "notes" as const, label: "笔记" },
  { value: "published" as const, label: "已发布" },
  { value: "metrics" as const, label: "数据" },
];

function toPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="font-rounded text-[15px] font-bold leading-tight text-ink">{value}</p>
      <p className="mt-0.5 truncate text-[10px] font-medium text-faint">{label}</p>
    </div>
  );
}

/** 作品 tab：笔记 / 已发布 / 数据三段。手机上只读加跳转，编辑仍在桌面工作台。 */
export default function MobileWorksPage() {
  const router = useRouter();
  const { snapshot, topics, drafts, loading, reload } = useWorkflowData();
  const [tab, setTab] = useState<WorksTab>("notes");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // 从首页点某条笔记进来时，把它高亮出来，否则用户不知道自己点的是哪条
  useEffect(() => {
    setHighlightId(recallTopic());
  }, []);

  const published = snapshot.drafts.filter(isPublishedDraft);

  const goTool = (topicId: string, href: string) => {
    rememberTopic(topicId);
    router.push(href);
  };

  return (
    <div>
      <MobileTabHeader
        title="作品"
        subtitle="笔记、已发布内容和数据表现"
        action={
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            aria-label="刷新"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted disabled:text-faint"
          >
            <RefreshCw size={14} strokeWidth={2.4} className={loading ? "animate-spin" : ""} />
          </button>
        }
      />

      <div className="px-3">
        <SegmentedControl value={tab} options={TABS} onChange={setTab} ariaLabel="作品分类" compact />
      </div>

      <div className="space-y-3 px-3 py-4">
        {tab === "notes" &&
          (topics.length === 0 ? (
            <EmptyState title="还没有笔记" description="先去「创作」用模板出一版，或拆一条爆款视频。" />
          ) : (
            topics.map((topic) => (
              <article
                key={topic.topicId}
                className={`rounded-3xl border bg-surface p-4 shadow-card ${
                  topic.topicId === highlightId ? "border-brand-300" : "border-line"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 text-[14px] font-bold leading-snug text-ink">{noteTitle(topic)}</h3>
                  <Badge tone="neutral">{getNoteStatus(topic, drafts)}</Badge>
                </div>

                {(topic.painPoint || topic.coreViewpoint) && (
                  <p className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-5 text-faint">
                    {topic.painPoint || topic.coreViewpoint}
                  </p>
                )}

                <div className="mt-3 flex gap-2 border-t border-line pt-3">
                  <button
                    type="button"
                    onClick={() => goTool(topic.topicId, "/m/t/cover")}
                    className="flex-1 rounded-xl bg-soft py-2 text-[12px] font-bold text-ink"
                  >
                    做封面
                  </button>
                  <button
                    type="button"
                    onClick={() => goTool(topic.topicId, "/m/t/video")}
                    className="flex-1 rounded-xl bg-soft py-2 text-[12px] font-bold text-ink"
                  >
                    做视频
                  </button>
                </div>
              </article>
            ))
          ))}

        {tab === "published" &&
          (published.length === 0 ? (
            <EmptyState title="还没有已发布的笔记" description="发布动作在桌面工作台完成。" />
          ) : (
            published.map((draft) => (
              <article key={draft.noteId} className="rounded-3xl border border-line bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 text-[14px] font-bold leading-snug text-ink">{draft.title}</h3>
                  <Badge tone="ok">已发</Badge>
                </div>
                <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-[12px] font-medium leading-5 text-faint">
                  {draft.content}
                </p>
                <p className="mt-2 text-[10px] font-medium text-faint">{draft.target || "小红书"}</p>
              </article>
            ))
          ))}

        {tab === "metrics" &&
          (snapshot.metrics.length === 0 ? (
            <EmptyState title="还没有复盘数据" description="发布后把数据填进飞书复盘表，这里就能看到。" />
          ) : (
            snapshot.metrics.map((metric) => (
              <article key={metric.noteId} className="rounded-3xl border border-line bg-surface p-4 shadow-card">
                <h3 className="text-[14px] font-bold leading-snug text-ink">{metric.title}</h3>
                <div className="mt-3 flex gap-2">
                  <Stat label="阅读" value={metric.reads} />
                  <Stat label="点赞" value={metric.likes} />
                  <Stat label="收藏" value={metric.saves} />
                  <Stat label="互动率" value={toPercent(metric.interactionRate)} />
                </div>
              </article>
            ))
          ))}
      </div>
    </div>
  );
}
