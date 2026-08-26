"use client";

import Image from "next/image";
import { Check, Loader2 } from "lucide-react";
import type { ModelProfile } from "@/lib/imageFactory";

/**
 * 模特库里的模特排成一排头像卡。
 * 选模特这件事在「直接用现成的」和「拿她生成新图」两条路里都要做一次，
 * 卡片长相必须一致，否则同一位模特在两处看起来像两个东西。
 */
export default function ModelCardRow({
  profiles,
  activeName,
  loading,
  size = "sm",
  emptyHint,
  onSelect,
}: {
  profiles: ModelProfile[];
  activeName: string;
  loading: boolean;
  size?: "sm" | "md";
  emptyHint: string;
  /** 再点一次当前这位由调用方决定是取消还是保持，行组件只负责报出点了谁 */
  onSelect: (profile: ModelProfile) => void;
}) {
  if (loading && profiles.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-faint">
        <Loader2 size={13} className="animate-spin" />
        正在读取模特库
      </div>
    );
  }
  if (profiles.length === 0) return <p className="text-[11px] leading-4 text-faint">{emptyHint}</p>;

  const width = size === "md" ? "w-24" : "w-[4.5rem]";

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {profiles.map((profile) => {
        const active = profile.name === activeName;
        return (
          <button
            key={profile.name}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(profile)}
            title={profile.traits || profile.name}
            className={`${width} shrink-0 overflow-hidden rounded-xl border bg-surface text-left transition-colors ${
              active ? "border-brand-400 ring-2 ring-brand-100" : "border-line hover:border-brand-300"
            }`}
          >
            <span className="relative block aspect-[3/4] bg-soft">
              <Image src={profile.cover.imageUrl} alt={profile.name} fill sizes="96px" className="object-cover" />
              {active && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-white">
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
            </span>
            <span className={`block truncate px-1.5 pt-1 text-[10px] font-bold ${active ? "text-brand-700" : "text-muted"}`}>
              {profile.name}
            </span>
            {size === "md" && <span className="block px-1.5 pb-1 text-[10px] text-faint">{profile.assets.length} 张</span>}
          </button>
        );
      })}
    </div>
  );
}
