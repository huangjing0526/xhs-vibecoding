import type { ReactNode } from "react";

type CalloutTone = "warn" | "info" | "ok";

const TONE: Record<CalloutTone, string> = {
  warn: "bg-warn/8 text-warn ring-warn/20",
  info: "bg-brand-50 text-brand-700 ring-brand-200",
  ok: "bg-ok/8 text-ok ring-ok/20",
};

/** 就地提示条：说明当前状态和下一步，不是弹窗、不打断操作。 */
export default function Callout({
  tone = "info",
  children,
  className = "",
}: {
  tone?: CalloutTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl px-3.5 py-2.5 text-sm font-semibold leading-6 ring-1 ring-inset ${TONE[tone]} ${className}`}>
      {children}
    </div>
  );
}
