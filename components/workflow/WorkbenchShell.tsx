"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { RefreshCw, Search } from "lucide-react";
import VibeNoteLogo from "@/components/VibeNoteLogo";
import AppRail from "@/components/workflow/AppRail";
import Button from "@/components/ui/Button";
import { AREAS, RAIL_AREAS, type AreaId } from "@/lib/capabilities";
import type { WorkflowMode } from "@/lib/workflowClient";

interface WorkbenchShellProps {
  area: AreaId;
  onAreaChange: (id: AreaId) => void;
  /** 图标轨顶部的「创建」，是动作不是区，由外部决定弹什么。 */
  onCreate: () => void;
  workflowMode: WorkflowMode;
  aiProvider?: string | null;
  syncing: boolean;
  syncLabel: string;
  onSync: () => void;
  onOpenCommandPalette: () => void;
  /** true = 内容直接坐在画布上（首页、目录页）；false = 包一张浮起的白面板（工具页）。 */
  plain?: boolean;
  /** 顶栏与内容之间的一条通栏提示，如从首页带过来的「本次要求」。 */
  banner?: ReactNode;
  children: ReactNode;
}

/**
 * 工作台外壳：72px 图标轨 + 一条顶栏 + 主内容。
 * 能力不再平铺在侧栏，改由「工具」目录承载，侧栏只留五个大类。
 */
export default function WorkbenchShell({
  area,
  onAreaChange,
  onCreate,
  workflowMode,
  aiProvider,
  syncing,
  syncLabel,
  onSync,
  onOpenCommandPalette,
  plain = false,
  banner,
  children,
}: WorkbenchShellProps) {
  const isConnected = workflowMode === "connected";
  const scrollRef = useRef<HTMLDivElement>(null);

  // 换区就回到顶部：主内容是同一个滚动容器，不重置的话新页会带着上一页的滚动位置进来
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [area]);

  return (
    <main className="flex h-screen overflow-hidden bg-canvas text-ink">
      <AppRail area={area} onAreaChange={onAreaChange} onCreate={onCreate} />

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-30 flex h-14 shrink-0 items-center gap-3 px-3 md:px-5">
          <div className="flex items-center gap-2 md:hidden">
            <VibeNoteLogo size={24} />
          </div>

          {/* 窄屏没有图标轨，顶栏兼职导航 */}
          <nav className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto md:hidden" aria-label="主导航">
            {RAIL_AREAS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onAreaChange(id)}
                aria-current={area === id ? "page" : undefined}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  area === id ? "bg-ink text-white" : "bg-surface text-muted"
                }`}
              >
                {AREAS[id].label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="hidden w-full max-w-sm items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2 text-left transition-colors hover:border-brand-300 md:flex"
          >
            <Search size={14} className="shrink-0 text-faint" />
            <span className="flex-1 text-[13px] font-semibold text-faint">搜索工具，或直接执行</span>
            <kbd className="shrink-0 rounded-md bg-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-faint">⌘K</kbd>
          </button>

          {/* 数据源状态与「同步」是同一件事，放在一起而不是散在两处 */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[11px] font-bold text-muted sm:flex">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isConnected ? "bg-ok" : "bg-faint"}`} />
              {isConnected ? "已连接飞书" : "本地体验"}
              {aiProvider && <span className="text-faint">· AI {aiProvider}</span>}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={onSync}
              loading={syncing}
              icon={<RefreshCw size={13} strokeWidth={2.4} />}
            >
              {syncing ? "同步中" : syncLabel}
            </Button>
          </div>
        </header>

        {banner && <div className="shrink-0 px-3 pb-2 md:pl-0 md:pr-3">{banner}</div>}

        <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3 md:pl-0 md:pr-3">
          {plain ? (
            <div ref={scrollRef} className="h-full overflow-auto">
              {children}
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
              {children}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
