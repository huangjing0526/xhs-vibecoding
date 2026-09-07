"use client";

import type { ReactNode } from "react";
import LinkButton from "@/components/workflow/LinkButton";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { isPublishedDraft, type ContentCard, type DraftNote } from "@/lib/xhsWorkflow";
import { summarizeQuality, type QualityCheckResult, type QualitySummary } from "@/lib/qualityCheck";

interface DaokuOption {
  bloggerId: string;
  name: string;
}

interface NoteInspectorProps {
  topic: ContentCard | null;
  draft: DraftNote | null;
  onEditTopic: () => void;
  onDeleteTopic: () => void;
  sourceSummary: string;
  onOpenLibrary: () => void;
  daokuOptions: DaokuOption[];
  topicDaokuMap: Record<string, string>;
  onBindDaoku: (topicId: string, bloggerId: string) => void;
  bloggerReady: boolean;
  onOpenBlogger: () => void;
  coverDataUrl: string;
  onOpenCover: () => void;
  videoReady: boolean;
  onOpenVideo: () => void;
  quality: QualityCheckResult | null;
  onOpenQuality: () => void;
  onPublish: () => void;
  publishing: boolean;
}

// 领域层的质检语义色 → Badge 色调
const QUALITY_TONE: Record<QualitySummary["tone"], BadgeTone> = {
  ok: "ok",
  warn: "warn",
  fail: "danger",
  muted: "neutral",
};

function truncate(text: string, maxLength = 90): string {
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function strategyItems(topic: ContentCard, draft: DraftNote | null): Array<{ label: string; value: string }> {
  const source = draft || topic;
  return [
    { label: "内容线", value: source.contentLane || "" },
    { label: "参考池", value: source.referencePool || "" },
    { label: "标题结构", value: source.viralTitleStructure || "" },
    { label: "正文结构", value: source.viralBodyStructure || "" },
    { label: "开头钩子", value: source.hookType || "" },
    { label: "资产类型", value: source.assetType || "" },
    { label: "生成前评分", value: topic.selectionScore !== undefined ? String(topic.selectionScore) : "" },
    { label: "相似风险", value: draft?.similarityRisk || "" },
  ].filter((item) => item.value);
}

function Section({
  title,
  status,
  statusTone = "neutral",
  action,
  children,
}: {
  title: string;
  status?: string;
  statusTone?: BadgeTone;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-line px-4 py-3.5 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{title}</h3>
          {status && <Badge tone={statusTone}>{status}</Badge>}
        </div>
        {action}
      </div>
      {children && <div className="mt-2.5">{children}</div>}
    </section>
  );
}

export default function NoteInspector({
  topic,
  draft,
  onEditTopic,
  onDeleteTopic,
  sourceSummary,
  onOpenLibrary,
  daokuOptions,
  topicDaokuMap,
  onBindDaoku,
  bloggerReady,
  onOpenBlogger,
  coverDataUrl,
  onOpenCover,
  videoReady,
  onOpenVideo,
  quality,
  onOpenQuality,
  onPublish,
  publishing,
}: NoteInspectorProps) {
  if (!topic) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-6 text-center text-sm leading-6 text-faint">
        选中一个项目，这里会显示它从选题到发布的全流程。
      </div>
    );
  }

  const boundId = topicDaokuMap[topic.topicId] || "";
  const boundName = daokuOptions.find((option) => option.bloggerId === boundId)?.name;
  const published = Boolean(draft && isPublishedDraft(draft));
  const daokuItems = [{ bloggerId: "", name: "不绑定" }, ...daokuOptions];
  const hardFail = Boolean(draft && quality?.hardFail);
  // 质检文案统一由领域层派生；这里只把语义色映射到 Badge 的色调
  const qualitySummary = summarizeQuality(quality, Boolean(draft));

  return (
    <div className="h-full overflow-auto bg-surface">
      <Section
        title="选题"
        action={
          <div className="flex gap-1.5">
            <LinkButton label="编辑" onClick={onEditTopic} />
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (window.confirm("确定删除这个项目（选题）吗？")) onDeleteTopic();
              }}
            >
              删除
            </Button>
          </div>
        }
      >
        <p className="text-sm font-semibold leading-6 text-ink">{truncate(topic.coreViewpoint, 80)}</p>
        {topic.painPoint && <p className="mt-1.5 text-xs leading-5 text-muted">痛点：{truncate(topic.painPoint, 80)}</p>}
      </Section>

      <Section title="素材" action={<LinkButton label="去素材库" onClick={onOpenLibrary} />}>
        <p className="text-xs leading-5 text-muted">{sourceSummary ? truncate(sourceSummary, 120) : "未关联素材"}</p>
      </Section>

      <Section title="策略">
        {strategyItems(topic, draft).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {strategyItems(topic, draft).map((item) => (
              <div key={item.label} className="rounded-xl bg-soft px-2.5 py-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-faint">{item.label}</div>
                <div className="mt-0.5 text-xs font-bold text-ink">{item.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-faint">这篇还没有策略字段，可在飞书表补齐后同步。</p>
        )}
      </Section>

      <Section
        title="道库"
        status={boundName ? boundName : "未绑定"}
        statusTone={boundName ? "ok" : "neutral"}
        action={<LinkButton label={bloggerReady ? "重新拆解" : "拆解博主"} onClick={onOpenBlogger} />}
      >
        <div className="flex flex-wrap gap-1.5">
          {daokuItems.map((item) => {
            const active = boundId === item.bloggerId;
            return (
              <button
                key={item.bloggerId || "none"}
                type="button"
                onClick={() => onBindDaoku(topic.topicId, item.bloggerId)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                  active ? "bg-ink text-white" : "bg-soft text-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                {item.name}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="封面"
        status={coverDataUrl ? "已生成" : "未生成"}
        statusTone={coverDataUrl ? "ok" : "neutral"}
        action={<LinkButton label={coverDataUrl ? "编辑封面" : "生成封面"} onClick={onOpenCover} />}
      >
        {coverDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverDataUrl} alt="封面预览" className="w-28 rounded-2xl border border-line shadow-card" />
        ) : (
          <p className="text-xs text-faint">还没有封面，点右侧生成。</p>
        )}
      </Section>

      <Section
        title="视频（可选）"
        status={videoReady ? "已生成方案" : "未制作"}
        statusTone={videoReady ? "ok" : "neutral"}
        action={<LinkButton label={videoReady ? "查看视频" : "做视频"} onClick={onOpenVideo} />}
      />

      {!published && (
        <Section
          title="质检"
          status={qualitySummary.shortLabel}
          statusTone={QUALITY_TONE[qualitySummary.tone]}
          action={draft ? <LinkButton label="质检兜底" onClick={onOpenQuality} /> : undefined}
        >
          <p className="text-xs leading-5 text-muted">{qualitySummary.summary}</p>
        </Section>
      )}

      <Section title="发布" status={published ? "已发布" : "待发布"} statusTone={published ? "ok" : "warn"}>
        {published ? (
          <p className="text-xs leading-5 text-ok">已发布，复盘记录已创建。</p>
        ) : (
          <Button
            block
            variant="primary"
            onClick={hardFail ? onOpenQuality : onPublish}
            disabled={!draft}
            loading={publishing}
          >
            {publishing
              ? "处理中"
              : !draft
                ? "先生成草稿"
                : hardFail
                  ? `先过质检（${quality?.failCount} 项硬伤）`
                  : "标记发布"}
          </Button>
        )}
      </Section>
    </div>
  );
}
