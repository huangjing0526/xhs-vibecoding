import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** 右侧主操作，如「生成选题」。 */
  action?: ReactNode;
  /** 标题下方的上下文条，如「当前笔记」。 */
  meta?: ReactNode;
  /** page=大标题页头（区页顶部）；bar=单行紧凑条（工作台三栏之上）。 */
  variant?: "page" | "bar";
}

/**
 * 统一页头：每个区一个清晰的视觉焦点——大标题 + 一句说明 + 唯一主操作。
 */
export default function PageHeader({ title, subtitle, action, meta, variant = "page" }: PageHeaderProps) {
  if (variant === "bar") {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="shrink-0 text-[15px] font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <span className="truncate text-xs font-medium text-faint">{subtitle}</span>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-rounded text-[28px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm leading-6 text-muted">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {meta && <div className="mt-4">{meta}</div>}
    </div>
  );
}
