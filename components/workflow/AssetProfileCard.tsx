"use client";

import Image from "next/image";
import type { AssetProfile, LibraryKind } from "@/lib/imageFactory";

/**
 * 资产库列表里的一个主体：封面 + 名字 + 张数。
 * 列表页要回答的是「库里都有谁」，不是「这位有哪些角度」——
 * 后者进详情再看，摊在列表上只会让一屏挤进两位模特。
 */

/** 封面画幅按库走：模特是竖幅人像，商品多为方图，场景多为横幅。 */
const COVER_ASPECT: Record<LibraryKind, string> = {
  models: "aspect-[3/4]",
  products: "aspect-square",
  scenes: "aspect-[4/3]",
};

export default function AssetProfileCard({
  profile,
  kind,
  onOpen,
}: {
  profile: AssetProfile;
  kind: LibraryKind;
  onOpen: (profile: AssetProfile) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(profile)}
      title={profile.traits || profile.name}
      className="group overflow-hidden rounded-2xl border border-line bg-surface text-left transition-all duration-150 hover:border-brand-300 hover:shadow-raised"
    >
      <div className={`relative ${COVER_ASPECT[kind]} bg-soft`}>
        <Image
          src={profile.cover.imageUrl}
          alt={profile.name}
          fill
          sizes="240px"
          className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        />
      </div>
      <div className="px-3 py-2.5">
        <p className="truncate text-[13px] font-bold text-ink">{profile.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-faint">
          {profile.assets.length} 张{profile.traits ? ` · ${profile.traits}` : ""}
        </p>
      </div>
    </button>
  );
}
