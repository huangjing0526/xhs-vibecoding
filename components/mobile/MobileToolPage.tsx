"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

interface MobileToolPageProps {
  title: string;
  /** 一行说清这个能力做什么，替代桌面端的页头副标题 */
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}

/** 能力二级页外壳：吸顶标题栏 + 返回，内容区自己排。 */
export default function MobileToolPage({ title, subtitle, action, children }: MobileToolPageProps) {
  const router = useRouter();

  // 从外部链接直接进来时没有历史可退，兜回首页而不是把用户留在死路上
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/m");
  };

  return (
    <div>
      <header className="sticky top-0 z-30 flex items-center gap-1.5 border-b border-line bg-canvas/95 px-2 py-2.5 backdrop-blur">
        <button
          type="button"
          onClick={goBack}
          aria-label="返回"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-soft hover:text-ink"
        >
          <ChevronLeft size={20} strokeWidth={2.2} />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold leading-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-[11px] font-medium text-faint">{subtitle}</p>}
        </div>

        {action && <div className="shrink-0 pr-1">{action}</div>}
      </header>

      <div className="px-3 py-4">{children}</div>
    </div>
  );
}
