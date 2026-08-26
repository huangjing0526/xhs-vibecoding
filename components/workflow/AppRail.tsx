"use client";

import { Plus } from "lucide-react";
import { AREAS, RAIL_GROUPS, type AreaId } from "@/lib/capabilities";

/**
 * 左侧图标轨：全站导航收进 72px，图标 + 两字标签，一眼扫完。
 *
 * 分两段：上段是干活的地方（首页 / 项目 / 工具），下段是四个存东西的库
 * （素材 / 模板 / 资产 / 作品）。一条分隔线把「做什么」和「东西放哪」隔开，
 * 免得七个平级图标看起来像七件同类的事。分组本身见 lib/capabilities 的 RAIL_GROUPS。
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

      <nav className="flex w-full flex-col items-center" aria-label="主导航">
        {RAIL_GROUPS.map((group, groupIndex) => (
          <div key={groupIndex} className="flex w-full flex-col items-center gap-0.5">
            {groupIndex > 0 && <span className="my-2 h-px w-8 rounded-full bg-line" aria-hidden="true" />}
            {group.map((id) => {
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
          </div>
        ))}
      </nav>
    </aside>
  );
}
