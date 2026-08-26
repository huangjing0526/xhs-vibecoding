"use client";

import { Plus } from "lucide-react";
import { AREAS, RAIL_AREAS, type AreaId } from "@/lib/capabilities";

/**
 * 左侧图标轨：全站导航收进 72px，图标 + 两字标签，一眼扫完。
 * 能力不再平铺在侧栏——它们进「工具」目录，侧栏只留大类。
 */
export default function AppRail({
  area,
  onAreaChange,
  onCreate,
}: {
  area: AreaId;
  onAreaChange: (id: AreaId) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="hidden w-[72px] shrink-0 flex-col items-center gap-1 py-3 md:flex">
      <button
        type="button"
        onClick={onCreate}
        className="group flex w-full flex-col items-center gap-1 pb-2"
        title="新建一篇笔记"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-white transition-colors group-hover:bg-black">
          <Plus size={18} strokeWidth={2.6} aria-hidden="true" />
        </span>
        <span className="text-[11px] font-bold leading-none text-muted">创建</span>
      </button>

      <nav className="flex w-full flex-col items-center gap-0.5" aria-label="主导航">
        {RAIL_AREAS.map((id) => {
          const meta = AREAS[id];
          const Icon = meta.icon;
          const active = area === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onAreaChange(id)}
              aria-current={active ? "page" : undefined}
              title={meta.hint}
              className={`flex w-[58px] flex-col items-center gap-1 rounded-2xl py-2 transition-colors ${
                active ? "bg-surface text-ink shadow-card" : "text-faint hover:bg-surface/70 hover:text-muted"
              }`}
            >
              <Icon size={20} strokeWidth={1.9} className={active ? "text-brand-500" : ""} aria-hidden="true" />
              <span className="text-[11px] font-bold leading-none">{meta.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
