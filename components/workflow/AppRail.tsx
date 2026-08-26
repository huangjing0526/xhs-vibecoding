"use client";

import { useState } from "react";
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
  onCreateNote,
  onCreateVideo,
}: {
  area: AreaId;
  onAreaChange: (id: AreaId) => void;
  onCreateNote: () => void;
  onCreateVideo: () => void;
}) {
  // 「创建」分两种项目，点开小菜单选一种；选完即关
  const [createOpen, setCreateOpen] = useState(false);
  const pick = (action: () => void) => {
    setCreateOpen(false);
    action();
  };
  // 菜单项的图标不自己挑，跟着各区在 AREAS 里登记的走，改图标只改一处
  const NoteIcon = AREAS.note.icon;
  const VideoIcon = AREAS.videoFactory.icon;

  return (
    <aside className="relative hidden w-[72px] shrink-0 flex-col items-center gap-1 py-3 md:flex">
      <button
        type="button"
        onClick={() => setCreateOpen((open) => !open)}
        aria-expanded={createOpen}
        className="group flex w-full flex-col items-center gap-1 pb-2"
        title="新建一个项目"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-white transition-colors group-hover:bg-black">
          <Plus size={18} strokeWidth={2.6} aria-hidden="true" />
        </span>
        <span className="text-[11px] font-bold leading-none text-muted">创建</span>
      </button>

      {createOpen && (
        <>
          {/* 透明遮罩：点菜单以外的任何地方都关掉它 */}
          <button
            type="button"
            aria-label="关闭创建菜单"
            onClick={() => setCreateOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute left-[64px] top-3 z-40 w-44 rounded-2xl border border-line bg-surface p-1.5 shadow-card">
            <button
              type="button"
              onClick={() => pick(onCreateNote)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-bold text-ink transition-colors hover:bg-soft"
            >
              <NoteIcon size={15} className="text-brand-500" aria-hidden="true" />
              图文笔记
            </button>
            <button
              type="button"
              onClick={() => pick(onCreateVideo)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-bold text-ink transition-colors hover:bg-soft"
            >
              <VideoIcon size={15} className="text-brand-500" aria-hidden="true" />
              视频项目
            </button>
          </div>
        </>
      )}

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
