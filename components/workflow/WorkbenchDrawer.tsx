"use client";

import type { ReactNode } from "react";

interface WorkbenchDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 抽屉宽度，默认较宽以容纳封面画布/视频分镜等工具。 */
  widthClass?: string;
}

/**
 * 右侧滑出抽屉：承载封面画布、视频分镜、博主拆解、更像爆款等重型工具。
 * 一次只开一个，关掉回到三栏，保持主工作区干净、上下文不丢。
 */
export default function WorkbenchDrawer({
  open,
  title,
  onClose,
  children,
  widthClass = "w-full max-w-3xl",
}: WorkbenchDrawerProps) {
  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`absolute right-0 top-0 flex h-full ${widthClass} flex-col bg-[#F5F5F7] shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#E5E5EA] bg-white px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1D1D1F]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#D2D2D7] bg-white px-3 py-1.5 text-xs font-semibold text-[#6E6E73] transition-colors hover:border-[#1D1D1F] hover:text-[#1D1D1F]"
          >
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{open && children}</div>
      </div>
    </div>
  );
}
