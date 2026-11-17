"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  /** 标题后的计数，参考「我的作品 0」那种写法 */
  count?: number;
  /** 有 href 才出「全部 ›」 */
  href?: string;
}

/** 分区标题：左边「标题 + 数量」，右边「全部 ›」。 */
export function SectionHeader({ title, count, href }: SectionHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-baseline gap-1.5 text-[17px] font-bold leading-tight text-ink">
        {title}
        {count !== undefined && <span className="font-rounded text-[15px] text-faint">{count}</span>}
      </h2>

      {href && (
        <Link href={href} className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-faint">
          全部
          <ChevronRight size={14} strokeWidth={2.4} />
        </Link>
      )}
    </div>
  );
}

/** 横向卡片轨：滑出屏幕边缘（负边距抵消页面内边距），带对齐吸附。 */
export function CardRail({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex snap-x snap-mandatory gap-3">{children}</div>
    </div>
  );
}
