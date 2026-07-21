"use client";

import { useMemo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import VibeNoteLogo from "@/components/VibeNoteLogo";
import NavIcon from "@/components/workflow/NavIcon";
import Button from "@/components/ui/Button";
import type { WorkflowMode } from "@/lib/workflowClient";

export type WorkbenchAreaId =
  | "workbench"
  | "library"
  | "review"
  | "cover"
  | "video"
  | "rewrite"
  | "blogger"
  | "quality"
  | "watermark";

export interface WorkbenchNavItem {
  id: WorkbenchAreaId;
  label: string;
  /** 可选副标题，一行说明这个区是干什么的。 */
  hint?: string;
}

export interface WorkbenchNavGroup {
  title: string;
  items: WorkbenchNavItem[];
}

interface WorkbenchShellProps {
  /** 置顶的独立入口，不归组、不带组标题（如「工作台」）。 */
  leadItems: WorkbenchNavItem[];
  groups: WorkbenchNavGroup[];
  area: WorkbenchAreaId;
  onAreaChange: (id: WorkbenchAreaId) => void;
  workflowMode: WorkflowMode;
  aiProvider?: string | null;
  syncing: boolean;
  syncLabel: string;
  onSync: () => void;
  children: ReactNode;
}

/** 侧栏菜单项：选中态是一张浮起的白卡，图标转品牌色——与画布拉开一层。 */
function NavButton({
  item,
  active,
  onSelect,
}: {
  item: WorkbenchNavItem;
  active: boolean;
  onSelect: (id: WorkbenchAreaId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? "page" : undefined}
      className={`group flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left transition-all duration-150 ${
        active ? "bg-surface text-ink shadow-card" : "text-muted hover:bg-surface/70 hover:text-ink"
      }`}
    >
      <span className={`shrink-0 transition-colors ${active ? "text-brand-500" : "text-faint group-hover:text-muted"}`}>
        <NavIcon id={item.id} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold leading-tight">{item.label}</span>
        {item.hint && (
          <span className="mt-0.5 block truncate text-[11px] font-medium leading-tight text-faint">{item.hint}</span>
        )}
      </span>
    </button>
  );
}

/**
 * 内容工作台外壳：侧栏直接坐在画布上，主内容是一张浮起的圆角面板。
 * 能力全部收敛到左栏，主区由各自页头承担视觉焦点。
 */
export default function WorkbenchShell({
  leadItems,
  groups,
  area,
  onAreaChange,
  workflowMode,
  aiProvider,
  syncing,
  syncLabel,
  onSync,
  children,
}: WorkbenchShellProps) {
  const isConnected = workflowMode === "connected";
  // 移动端顶栏用的扁平项列表：分组在窄屏没有意义，置顶入口直接排在最前。
  const allItems = useMemo(
    () => [...leadItems, ...groups.flatMap((group) => group.items)],
    [leadItems, groups],
  );

  return (
    <main className="flex h-screen overflow-hidden bg-canvas text-ink">
      <aside className="hidden w-[252px] shrink-0 flex-col px-3 py-3 md:flex">
        <div className="flex h-12 shrink-0 items-center gap-2.5 px-2">
          <VibeNoteLogo size={28} />
          <span className="min-w-0 font-rounded text-[17px] font-bold leading-none tracking-tight text-ink">
            VibeNote
          </span>
        </div>

        <nav className="mt-2 flex-1 overflow-y-auto pb-2" aria-label="工作区">
          <div className="mb-5 space-y-1">
            {leadItems.map((item) => (
              <NavButton key={item.id} item={item} active={area === item.id} onSelect={onAreaChange} />
            ))}
          </div>

          {groups.map((group) => (
            <div key={group.title} className="mb-5 last:mb-0">
              <div className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
                {group.title}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavButton key={item.id} item={item} active={area === item.id} onSelect={onAreaChange} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* 数据源状态与「同步」是同一件事，放在一起而不是散在顶栏 */}
        <div className="shrink-0 rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-card">
          <div className="flex items-center gap-2 text-xs font-bold text-muted">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isConnected ? "bg-ok" : "bg-faint"}`} />
            <span className="truncate">{isConnected ? "已连接飞书" : "本地体验"}</span>
          </div>
          {aiProvider && <div className="mt-1 truncate text-[11px] font-medium text-faint">AI {aiProvider}</div>}
          <Button
            block
            size="sm"
            variant="secondary"
            className="mt-2.5"
            onClick={onSync}
            loading={syncing}
            icon={<RefreshCw size={13} strokeWidth={2.4} />}
          >
            {syncing ? "同步中" : syncLabel}
          </Button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden md:py-3 md:pr-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-line bg-surface md:rounded-3xl md:border md:shadow-card">
          {/* 窄屏没有侧栏，用顶栏承载导航与同步；桌面端这些都在左栏里，不额外占一条高度 */}
          <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 md:hidden">
            <VibeNoteLogo size={24} />

            <nav className="flex min-w-0 items-center gap-1.5 overflow-x-auto" aria-label="工作区">
              {allItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onAreaChange(item.id)}
                  aria-current={area === item.id ? "page" : undefined}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                    area === item.id ? "bg-ink text-white" : "bg-soft text-muted"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <Button
              size="sm"
              variant="secondary"
              className="ml-auto"
              onClick={onSync}
              loading={syncing}
              icon={<RefreshCw size={13} strokeWidth={2.4} />}
            >
              {syncing ? "同步中" : syncLabel}
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>
      </section>
    </main>
  );
}
