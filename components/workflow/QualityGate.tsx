"use client";

import { useEffect, useState } from "react";
import LinkButton from "@/components/workflow/LinkButton";
import { isPublishedDraft, type DraftNote } from "@/lib/xhsWorkflow";
import {
  summarizeQuality,
  type QualityCheckResult,
  type QualityFixAction,
  type QualityIssue,
  type QualityVerdict,
} from "@/lib/qualityCheck";

interface QualityGateProps {
  result: QualityCheckResult;
  draft: DraftNote | null;
  /** 标签/引导内联编辑后回写前端草稿（不写飞书） */
  onApplyDraftPatch: (patch: Partial<DraftNote>) => void;
  /** 跳已有入口修复（改写/封面/素材），由容器按 action 路由 */
  onResolve: (action: QualityFixAction) => void;
  onPublish: () => void;
  publishing: boolean;
}

const VERDICT_META: Record<QualityVerdict, { label: string; badge: string; dot: string }> = {
  pass: { label: "通过", badge: "bg-[#0A7F64]/10 text-[#0A7F64]", dot: "bg-[#0A7F64]" },
  warn: { label: "警告", badge: "bg-[#FFF7ED] text-[#B25E00]", dot: "bg-[#E08600]" },
  fail: { label: "不过", badge: "bg-[#FFF0F2] text-[#FF2442]", dot: "bg-[#FF2442]" },
};

/** 「跳抽屉/页面」类修复动作 → 按钮文案；其余动作（tags/cta）走内联编辑，none 无修复入口。 */
const DRAWER_FIX_LABEL: Partial<Record<QualityFixAction, string>> = {
  rewrite: "去改写",
  cover: "去封面",
  source: "对照素材",
};

const SUMMARY_TONE: Record<"ok" | "warn" | "fail" | "muted", string> = {
  ok: "border-[#0A7F64]/20 bg-[#0A7F64]/5 text-[#0A7F64]",
  warn: "border-[#E08600]/20 bg-[#FFF7ED] text-[#B25E00]",
  fail: "border-[#FF2442]/20 bg-[#FFF0F2] text-[#FF2442]",
  muted: "border-[#E5E5EA] bg-white text-[#6E6E73]",
};

/** 标签/引导没有别的编辑入口，质检面板里直接内联改 */
function InlineFix({
  label,
  initial,
  placeholder,
  onSave,
}: {
  label: string;
  initial: string;
  placeholder: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  const dirty = value.trim() !== initial.trim();
  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-md border border-[#E5E5EA] bg-white px-2.5 py-1.5 text-xs text-[#1D1D1F] outline-none focus:border-[#1D1D1F]"
      />
      <button
        type="button"
        onClick={() => onSave(value)}
        disabled={!dirty}
        className="shrink-0 rounded-md bg-[#1D1D1F] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6]"
      >
        {label}
      </button>
    </div>
  );
}

function IssueCard({
  issue,
  draft,
  onApplyDraftPatch,
  onResolve,
}: {
  issue: QualityIssue;
  draft: DraftNote | null;
  onApplyDraftPatch: (patch: Partial<DraftNote>) => void;
  onResolve: (action: QualityFixAction) => void;
}) {
  const meta = VERDICT_META[issue.verdict];
  const showFix = issue.verdict !== "pass";
  const drawerLabel = DRAWER_FIX_LABEL[issue.fixAction];

  return (
    <div className="rounded-xl border border-[#E5E5EA] bg-white p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          <h4 className="text-sm font-semibold text-[#1D1D1F]">{issue.label}</h4>
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${meta.badge}`}>{meta.label}</span>
        </div>
        {showFix && drawerLabel && <LinkButton label={drawerLabel} onClick={() => onResolve(issue.fixAction)} />}
      </div>
      <p className="mt-2 text-xs leading-5 text-[#6E6E73]">{issue.message}</p>
      {showFix && <p className="mt-1 text-xs leading-5 text-[#A1A1A6]">建议：{issue.fixHint}</p>}
      {showFix && issue.fixAction === "tags" && draft && (
        <InlineFix
          label="重配标签"
          initial={draft.tags.join(" ")}
          placeholder="用空格分隔，如 #AI工具 #小红书运营 #避坑"
          onSave={(value) => onApplyDraftPatch({ tags: value.split(/\s+/).filter(Boolean) })}
        />
      )}
      {showFix && issue.fixAction === "cta" && draft && (
        <InlineFix
          label="重写引导"
          initial={draft.commentPrompt}
          placeholder="写一个真实讨论问题"
          onSave={(value) => onApplyDraftPatch({ commentPrompt: value })}
        />
      )}
    </div>
  );
}

/**
 * 质检与发布兜底抽屉：把工作流图第 5 步的 5 个动作落成可操作的闸门。
 * 全程纯规则，结果实时随草稿变化；有硬伤（fail）则拦住发布。
 */
export default function QualityGate({
  result,
  draft,
  onApplyDraftPatch,
  onResolve,
  onPublish,
  publishing,
}: QualityGateProps) {
  const published = Boolean(draft && isPublishedDraft(draft));
  const summary = summarizeQuality(result, Boolean(draft));

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${SUMMARY_TONE[summary.tone]}`}>
        {summary.summary}
      </div>

      <div className="space-y-2.5">
        {result.issues.map((issue) => (
          <IssueCard
            key={issue.dimension}
            issue={issue}
            draft={draft}
            onApplyDraftPatch={onApplyDraftPatch}
            onResolve={onResolve}
          />
        ))}
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-[#E5E5EA] bg-[#F5F5F7] px-4 pb-1 pt-3">
        {published ? (
          <p className="py-1 text-center text-xs font-semibold text-[#0A7F64]">已发布，复盘记录已创建。</p>
        ) : (
          <>
            <button
              type="button"
              onClick={onPublish}
              disabled={!draft || publishing || result.hardFail}
              className="w-full rounded-lg bg-[#FF2442] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E01E3A] disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6]"
            >
              {publishing
                ? "处理中…"
                : result.hardFail
                  ? `先处理 ${result.failCount} 项硬伤`
                  : result.warnCount > 0
                    ? "仍要发布"
                    : "通过质检，标记发布"}
            </button>
            {result.hardFail && (
              <p className="mt-1.5 text-center text-[11px] text-[#A1A1A6]">硬伤未清不能发布；警告可自行判断。</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
