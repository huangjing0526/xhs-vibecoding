import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "outline" | "brand" | "ok" | "warn" | "danger" | "xhs";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-soft text-muted",
  outline: "bg-surface text-muted ring-1 ring-inset ring-line",
  brand: "bg-brand-50 text-brand-600",
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  xhs: "bg-xhs/10 text-xhs",
};

/** 状态胶囊：全圆角，只承载「一个词的状态」，不放长文案。 */
export default function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold leading-5 ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
