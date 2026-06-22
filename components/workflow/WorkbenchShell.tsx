"use client";

import type { ReactNode } from "react";
import VibeNoteLogo from "@/components/VibeNoteLogo";
import type { WorkflowMode } from "@/lib/workflowClient";

export type WorkbenchAreaId = "workbench" | "library" | "review";

export interface WorkbenchArea {
  id: WorkbenchAreaId;
  label: string;
}

interface WorkbenchShellProps {
  areas: WorkbenchArea[];
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
 * 内容工作台外壳：顶栏（品牌 + 区切换 + 同步）+ 全宽内容区。
 * 顶层只有 3 个区（工作台 / 素材库 / 复盘），围绕「一篇笔记」而非「阶段」组织。
 */
export default function WorkbenchShell({
  areas,
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

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#F5F5F7] text-[#1D1D1F]">
      <header className="z-30 flex shrink-0 items-center gap-4 border-b border-[#E5E5EA] bg-white px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center">
            <VibeNoteLogo size={32} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight text-[#1D1D1F]">内容创作 Studio</div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#6E6E73]">
              <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-[#0A7F64]" : "bg-[#A1A1A6]"}`} />
              <span>{isConnected ? "已连接飞书" : "本地体验"}</span>
              {aiProvider && <span className="text-[#C7C7CC]">· AI {aiProvider}</span>}
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1 rounded-lg bg-[#F0F0F2] p-0.5" aria-label="工作区">
          {areas.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onAreaChange(item.id)}
              aria-current={area === item.id ? "page" : undefined}
              className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                area === item.id ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#6E6E73] hover:text-[#1D1D1F]"
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
            className="rounded-lg border border-[#D2D2D7] bg-white px-3 py-1.5 text-xs font-semibold text-[#1D1D1F] transition-colors hover:bg-[#F5F5F7] disabled:cursor-not-allowed disabled:text-[#A1A1A6]"
          >
            {syncing ? "同步中…" : syncLabel}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </main>
  );
}
