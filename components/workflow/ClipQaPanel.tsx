"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { CLIP_QA_GATES, clipQaCleared, type ClipQa } from "@/lib/videoFactory";

const GATE_LABEL = Object.fromEntries(CLIP_QA_GATES.map((gate) => [gate.id, gate.label]));

/** 状态标；fail 的文案要带关数，单独拼 */
const STATUS: Record<"busy" | "none" | ClipQa["status"], { tone: BadgeTone; label: string }> = {
  busy: { tone: "neutral", label: "验收中" },
  none: { tone: "warn", label: "未验收" },
  pass: { tone: "ok", label: "验收通过" },
  override: { tone: "brand", label: "已放行" },
  fail: { tone: "danger", label: "关没过" },
};

/**
 * 一镜的验收结论：过了只亮一个标；没过就逐关列出哪里不对，给「重验」和「放行」两条路。
 * 放行必须写理由——看图模型会误判，但每一次放行都得留下「人为什么觉得能用」。
 */
export default function ClipQaPanel({
  qa,
  busy,
  onRecheck,
  onOverride,
}: {
  qa: ClipQa | undefined;
  busy: boolean;
  onRecheck: () => void;
  onOverride: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [overriding, setOverriding] = useState(false);

  const failed = qa?.gates.filter((gate) => gate.verdict === "fail") || [];
  const cleared = clipQaCleared(qa);
  const status = STATUS[busy ? "busy" : qa?.status ?? "none"];

  return (
    <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.tone}>
          {!busy && qa?.status === "fail" ? `${failed.length} ` : ""}
          {status.label}
        </Badge>
        {qa?.status === "override" && qa.overrideReason && (
          <span className="min-w-0 flex-1 truncate text-[11px] text-faint">{qa.overrideReason}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onRecheck} disabled={busy} icon={<RefreshCw size={12} />}>
            {qa ? "重验" : "验收"}
          </Button>
          {!cleared && !overriding && (
            <Button size="sm" variant="ghost" onClick={() => setOverriding(true)} disabled={busy}>
              放行
            </Button>
          )}
        </div>
      </div>

      {failed.length > 0 && (
        <ul className="mt-2 space-y-1">
          {failed.map((gate) => (
            <li key={gate.id} className="text-[11px] leading-5 text-muted">
              <b className="text-danger">{GATE_LABEL[gate.id]}</b>　{gate.evidence}
            </li>
          ))}
        </ul>
      )}

      {overriding && (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!reason.trim()) return;
            onOverride(reason.trim());
            setOverriding(false);
            setReason("");
          }}
        >
          <Input
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="放行理由"
            className="h-8 text-xs"
          />
          <Button size="sm" variant="secondary" type="submit" disabled={!reason.trim()}>
            确认
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setOverriding(false)}>
            取消
          </Button>
        </form>
      )}
    </div>
  );
}
