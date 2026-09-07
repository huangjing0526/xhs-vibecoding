"use client";

import { useEffect, useState } from "react";
import LinkButton from "@/components/workflow/LinkButton";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { Input } from "@/components/ui/Field";
import { isPublishedDraft, type DraftNote } from "@/lib/xhsWorkflow";
import {
  summarizeQuality,
  type QualityCheckResult,
  type QualityFixAction,
  type QualityIssue,
  type QualitySummary,
  type QualityVerdict,
} from "@/lib/qualityCheck";

interface QualityGateProps {
  result: QualityCheckResult;
  draft: DraftNote | null;
  /** 标签/引导内联编辑后保存草稿（连上飞书时一并写回） */
  onApplyDraftPatch: (patch: Partial<DraftNote>) => void;
  /** 跳已有入口修复（改写/封面/素材），由容器按 action 路由 */
  onResolve: (action: QualityFixAction) => void;
  /** 质检过了就去发布包拿成品，标记发布在那边做 */
  onOpenPublish: () => void;
  /** 内联修复正在保存 */
  applyingPatch: boolean;
}

const VERDICT_META: Record<QualityVerdict, { label: string; tone: BadgeTone; dot: string }> = {
  pass: { label: "通过", tone: "ok", dot: "bg-ok" },
  warn: { label: "警告", tone: "warn", dot: "bg-warn" },
  fail: { label: "不过", tone: "danger", dot: "bg-danger" },
};

/** 「跳抽屉/页面」类修复动作 → 按钮文案；其余动作（tags/cta）走内联编辑，none 无修复入口。 */
const DRAWER_FIX_LABEL: Partial<Record<QualityFixAction, string>> = {
  rewrite: "去改写",
  cover: "去封面",
  source: "对照素材",
};

const SUMMARY_TONE: Record<QualitySummary["tone"], "ok" | "warn" | "info"> = {
  ok: "ok",
  warn: "warn",
  fail: "warn",
  muted: "info",
};

/** 标签/引导没有别的编辑入口，质检面板里直接内联改 */
function InlineFix({
  label,
  initial,
  placeholder,
  saving,
  onSave,
}: {
  label: string;
  initial: string;
  placeholder: string;
  saving: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  const dirty = value.trim() !== initial.trim();
  return (
    <div className="mt-2.5 flex items-center gap-2">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="h-9 min-w-0 flex-1 text-xs"
      />
      <Button size="sm" variant="primary" onClick={() => onSave(value)} disabled={!dirty} loading={saving}>
        {label}
      </Button>
    </div>
  );
}

function IssueCard({
  issue,
  draft,
  applyingPatch,
  onApplyDraftPatch,
  onResolve,
}: {
  issue: QualityIssue;
  draft: DraftNote | null;
  applyingPatch: boolean;
  onApplyDraftPatch: (patch: Partial<DraftNote>) => void;
  onResolve: (action: QualityFixAction) => void;
}) {
  const meta = VERDICT_META[issue.verdict];
  const showFix = issue.verdict !== "pass";
  const drawerLabel = DRAWER_FIX_LABEL[issue.fixAction];

  return (
    <div className="rounded-3xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
          <h4 className="truncate text-sm font-bold text-ink">{issue.label}</h4>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
        {showFix && drawerLabel && <LinkButton label={drawerLabel} onClick={() => onResolve(issue.fixAction)} />}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted">{issue.message}</p>
      {showFix && <p className="mt-1 text-xs leading-5 text-faint">建议：{issue.fixHint}</p>}
      {showFix && issue.fixAction === "tags" && draft && (
        <InlineFix
          label="重配标签"
          saving={applyingPatch}
          initial={draft.tags.join(" ")}
          placeholder="用空格分隔，如 #AI工具 #小红书运营 #避坑"
          onSave={(value) => onApplyDraftPatch({ tags: value.split(/\s+/).filter(Boolean) })}
        />
      )}
      {showFix && issue.fixAction === "cta" && draft && (
        <InlineFix
          label="重写引导"
          saving={applyingPatch}
          initial={draft.commentPrompt}
          placeholder="写一个真实讨论问题"
          onSave={(value) => onApplyDraftPatch({ commentPrompt: value })}
        />
      )}
    </div>
  );
}

/**
 * 质检与发布兜底：把工作流第 5 步的动作落成可操作的闸门。
 * 全程纯规则，结果实时随草稿变化；有硬伤（fail）则拦住发布。
 */
export default function QualityGate({
  result,
  draft,
  onApplyDraftPatch,
  onResolve,
  onOpenPublish,
  applyingPatch,
}: QualityGateProps) {
  const published = Boolean(draft && isPublishedDraft(draft));
  const summary = summarizeQuality(result, Boolean(draft));

  return (
    <div className="space-y-3">
      <Callout tone={SUMMARY_TONE[summary.tone]}>
        {summary.summary}
      </Callout>

      <div className="space-y-2.5">
        {result.issues.map((issue) => (
          <IssueCard
            key={issue.dimension}
            issue={issue}
            draft={draft}
            applyingPatch={applyingPatch}
            onApplyDraftPatch={onApplyDraftPatch}
            onResolve={onResolve}
          />
        ))}
      </div>

      <div className="sticky bottom-0 rounded-3xl border border-line bg-surface/90 p-4 shadow-raised backdrop-blur">
        {published ? (
          <p className="text-center text-xs font-bold text-ok">已发布，复盘记录已创建。</p>
        ) : (
          <>
            <Button block size="lg" variant="primary" onClick={onOpenPublish} disabled={!draft || result.hardFail}>
              {result.hardFail
                ? `先处理 ${result.failCount} 项硬伤`
                : result.warnCount > 0
                  ? "仍要发，去拿发布包"
                  : "通过质检，去拿发布包"}
            </Button>
            {result.hardFail && (
              <p className="mt-2 text-center text-[11px] text-faint">硬伤未清不能发布；警告可自行判断。</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
