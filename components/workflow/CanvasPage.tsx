import type { ReactNode } from "react";

/**
 * 坐在画布上那几页的统一容器：同一条内容宽度、同一套页头。
 * 首页之外的目录/列表页（工具、模板、项目、素材库、资产库）都走它，
 * 否则每页各写一遍标题排版，宽度和字号迟早各走各的。
 */
export default function CanvasPage({
  title,
  subtitle,
  /** 页头右侧：主操作按钮，或搜索框这类与本页同级的控件。 */
  action,
  children,
}: {
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-rounded text-[26px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm leading-6 text-muted">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
