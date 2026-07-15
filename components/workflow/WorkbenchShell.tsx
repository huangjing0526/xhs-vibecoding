"use client";

import { useMemo, type ReactNode } from "react";
import VibeNoteLogo from "@/components/VibeNoteLogo";
import NavIcon from "@/components/workflow/NavIcon";
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
  /** 可选副标题，仅内容流程组用，体现流水线先后。 */
  hint?: string;
}

export interface WorkbenchNavGroup {
  title: string;
  items: WorkbenchNavItem[];
}

interface WorkbenchShellProps {
  groups: WorkbenchNavGroup[];
  area: WorkbenchAreaId;
  onAreaChange: (id: WorkbenchAreaId) => void;
  workflowMode: WorkflowMode;
  aiProvider?: string | null;
  syncing: boolean;
  syncLabel: string;
  onSync: () => void;
  headerAction?: ReactNode;
  children: ReactNode;
}

/**
 * 内容工作台外壳：左侧两级分组导航（内容流程 / 制作工具）+ 顶部工具条 + 全宽内容区。
 * 对标参考站：能力全部收敛到左栏、可见可预期，主区由各自的页头承担视觉焦点。
 */
export default function WorkbenchShell({
  groups,
  area,
  onAreaChange,
  workflowMode,
  aiProvider,
  syncing,
  syncLabel,
  onSync,
  headerAction,
  children,
}: WorkbenchShellProps) {
  const isConnected = workflowMode === "connected";
  // 移动端顶栏用的扁平项列表；groups 稳定，缓存避免每次渲染重建
  const allItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  return (
    <main className="flex h-screen overflow-hidden bg-[#FAFAF8] text-[#18181B]">
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-[#ECEBE7] bg-white/90 md:flex">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[#F0EFEB] px-4">
          <VibeNoteLogo size={26} />
          <div className="min-w-0 text-[17px] font-black leading-none tracking-normal text-[#111111]">VibeNote</div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="工作区">
          {groups.map((group) => (
            <div key={group.title} className="mb-4 last:mb-0">
              <div className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-[#A5A29C]">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = area === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onAreaChange(item.id)}
                      aria-current={active ? "page" : undefined}
                      className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                        active
                          ? "bg-[#F3F3F1] text-[#111111]"
                          : "text-[#5F5F63] hover:bg-[#F7F7F5] hover:text-[#111111]"
                      }`}
                    >
                      <span
                        className={`shrink-0 transition-colors ${
                          active ? "text-[#FF2442]" : "text-[#B8B6AF] group-hover:text-[#74716B]"
                        }`}
                      >
                        <NavIcon id={item.id} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold leading-tight">{item.label}</span>
                        {item.hint && (
                          <span className="mt-0.5 block truncate text-[11px] font-medium leading-tight text-[#A5A29C]">
                            {item.hint}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-[#F0EFEB] px-4 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#74716B]">
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-[#0A7F64]" : "bg-[#B8B6AF]"}`} />
            <span>{isConnected ? "已连接飞书" : "本地体验"}</span>
          </div>
          {aiProvider && <div className="mt-1 text-[11px] font-medium text-[#A5A29C]">AI {aiProvider}</div>}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-30 flex h-12 shrink-0 items-center gap-3 border-b border-[#ECEBE7] bg-white/88 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <VibeNoteLogo size={22} />
            <span className="hidden text-base font-black text-[#111111] sm:inline">VibeNote</span>
          </div>

          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto md:hidden" aria-label="工作区">
            {allItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onAreaChange(item.id)}
                aria-current={area === item.id ? "page" : undefined}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  area === item.id ? "bg-[#111111] text-white" : "bg-[#F4F4F1] text-[#5F5F63]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {headerAction}
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="rounded-lg border border-[#E1E0DB] bg-[#F8F8F5] px-3 py-1.5 text-xs font-bold text-[#18181B] transition-colors hover:border-[#C9C7BF] hover:bg-white disabled:cursor-not-allowed disabled:text-[#AAA8A1]"
            >
              {syncing ? "同步中…" : syncLabel}
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </section>
    </main>
  );
}
