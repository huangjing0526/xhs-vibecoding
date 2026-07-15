"use client";

import type { ReactNode } from "react";
import LinkButton from "@/components/workflow/LinkButton";
import { isPublishedDraft, type ContentCard, type DraftNote } from "@/lib/xhsWorkflow";
import { summarizeQuality, type QualityCheckResult } from "@/lib/qualityCheck";

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
  statusTone = "muted",
  action,
  children,
}: {
  title: string;
  status?: string;
  statusTone?: "muted" | "ok" | "warn";
  action?: ReactNode;
  children?: ReactNode;
}) {
  const tone =
    statusTone === "ok"
      ? "bg-[#0A7F64]/10 text-[#0A7F64]"
      : statusTone === "warn"
        ? "bg-[#FFF0F2] text-[#FF2442]"
        : "bg-[#F0F0F2] text-[#6E6E73]";
  return (
    <section className="border-b border-[#E5E5EA] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#6E6E73]">{title}</h3>
          {status && <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>{status}</span>}
        </div>
        {action}
      </div>
      {children && <div className="mt-2">{children}</div>}
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
      <div className="flex h-full items-center justify-center bg-white p-6 text-center text-sm text-[#A1A1A6]">
        选中一篇笔记，这里会显示它从选题到发布的全流程。
      </div>
    );
  }

  const boundId = topicDaokuMap[topic.topicId] || "";
  const boundName = daokuOptions.find((option) => option.bloggerId === boundId)?.name;
  const published = Boolean(draft && isPublishedDraft(draft));
  const daokuItems = [{ bloggerId: "", name: "不绑定" }, ...daokuOptions];
  const hardFail = Boolean(draft && quality?.hardFail);
  // 质检文案统一由领域层派生；这里只把语义色映射到 Section 的三档 tone（fail 走红色 warn 档）
  const qualitySummary = summarizeQuality(quality, Boolean(draft));
  const qualityTone: "muted" | "ok" | "warn" = qualitySummary.tone === "fail" ? "warn" : qualitySummary.tone === "warn" ? "muted" : qualitySummary.tone;

  return (
    <div className="h-full overflow-auto bg-white">
      <Section
        title="选题"
        action={
          <div className="flex gap-1.5">
            <LinkButton label="编辑" onClick={onEditTopic} />
            <button
              type="button"
              onClick={() => {
                if (window.confirm("确定删除这篇笔记（选题）吗？")) onDeleteTopic();
              }}
              className="shrink-0 rounded-md border border-[#D2D2D7] bg-white px-2.5 py-1 text-xs font-semibold text-[#A1A1A6] transition-colors hover:border-rose-600 hover:text-rose-600"
            >
              删除
            </button>
          </div>
        }
      >
        <p className="text-sm font-semibold leading-6 text-[#1D1D1F]">{truncate(topic.coreViewpoint, 80)}</p>
        {topic.painPoint && <p className="mt-1 text-xs leading-5 text-[#6E6E73]">痛点：{truncate(topic.painPoint, 80)}</p>}
      </Section>

      <Section title="素材" action={<LinkButton label="去素材库" onClick={onOpenLibrary} />}>
        <p className="text-xs leading-5 text-[#6E6E73]">{sourceSummary ? truncate(sourceSummary, 120) : "未关联素材"}</p>
      </Section>

      <Section title="策略">
        {strategyItems(topic, draft).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {strategyItems(topic, draft).map((item) => (
              <div key={item.label} className="rounded-md bg-[#F5F5F7] px-2.5 py-1">
                <div className="text-[11px] font-bold text-[#A1A1A6]">{item.label}</div>
                <div className="mt-0.5 text-xs font-semibold text-[#1D1D1F]">{item.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#A1A1A6]">这篇还没有策略字段，可在飞书表补齐后同步。</p>
        )}
      </Section>

      <Section
        title="道库"
        status={boundName ? boundName : "未绑定"}
        statusTone={boundName ? "ok" : "muted"}
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
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-[#1D1D1F] text-white"
                    : "border border-[#D2D2D7] bg-white text-[#1D1D1F] hover:bg-[#F5F5F7]"
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
        statusTone={coverDataUrl ? "ok" : "muted"}
        action={<LinkButton label={coverDataUrl ? "编辑封面" : "生成封面"} onClick={onOpenCover} />}
      >
        {coverDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverDataUrl} alt="封面预览" className="w-28 rounded-md border border-[#E5E5EA]" />
        ) : (
          <p className="text-xs text-[#A1A1A6]">还没有封面，点右侧生成。</p>
        )}
      </Section>

      <Section
        title="视频（可选）"
        status={videoReady ? "已生成方案" : "未制作"}
        statusTone={videoReady ? "ok" : "muted"}
        action={<LinkButton label={videoReady ? "查看视频" : "做视频"} onClick={onOpenVideo} />}
      />

      {!published && (
        <Section
          title="质检"
          status={qualitySummary.shortLabel}
          statusTone={qualityTone}
          action={draft ? <LinkButton label="质检兜底" onClick={onOpenQuality} /> : undefined}
        >
          <p className="text-xs leading-5 text-[#6E6E73]">{qualitySummary.summary}</p>
        </Section>
      )}

      <Section title="发布" status={published ? "已发布" : "待发布"} statusTone={published ? "ok" : "warn"}>
        {published ? (
          <p className="text-xs text-[#0A7F64]">已发布，复盘记录已创建。</p>
        ) : (
          <button
            type="button"
            onClick={hardFail ? onOpenQuality : onPublish}
            disabled={!draft || publishing}
            className="w-full rounded-lg bg-[#FF2442] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#E01E3A] disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6]"
          >
            {publishing
              ? "处理中…"
              : !draft
                ? "先生成草稿"
                : hardFail
                  ? `先过质检（${quality?.failCount} 项硬伤）`
                  : "标记发布"}
          </button>
        )}
      </Section>
    </div>
  );
}
