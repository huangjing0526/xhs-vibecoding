import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  /** 说清下一步怎么做，而不是复述「暂无数据」 */
  description?: string;
  action?: ReactNode;
  /** bare=不带虚线框，用于已经在卡片里的场景 */
  bare?: boolean;
}

/** 空态：一句话说清现在为什么空、下一步点哪。 */
export default function EmptyState({ icon, title, description, action, bare = false }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-6 py-14 text-center ${
        bare ? "" : "rounded-3xl border border-dashed border-line-strong bg-surface/60"
      }`}
    >
      {icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
          {icon}
        </span>
      )}
      <div>
        <p className="text-sm font-bold text-ink">{title}</p>
        {description && <p className="mt-1.5 max-w-sm text-xs leading-5 text-faint">{description}</p>}
      </div>
      {action}
    </div>
  );
}
