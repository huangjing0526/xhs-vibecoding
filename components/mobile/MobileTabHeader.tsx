"use client";

import type { ReactNode } from "react";

/** 一级 tab 页的页头：只有标题和一行说明，没有返回（返回靠底部 tab）。 */
export default function MobileTabHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3 px-3 pb-4 pt-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[12px] font-medium leading-5 text-faint">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </header>
  );
}
