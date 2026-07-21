import type { ReactNode } from "react";

const TONE = {
  ink: "text-ink",
  brand: "text-brand-500",
  ok: "text-ok",
} as const;

/** 计数指标：圆体数字 + 小标签，一排若干个。 */
export default function Stat({
  value,
  label,
  tone = "ink",
}: {
  value: ReactNode;
  label: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className="flex-1 rounded-2xl bg-soft px-3 py-3 text-center">
      <div className={`font-rounded text-xl font-bold tabular-nums ${TONE[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs text-faint">{label}</div>
    </div>
  );
}
