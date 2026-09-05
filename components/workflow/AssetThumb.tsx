"use client";

import Image from "next/image";
import { Download, Trash2 } from "lucide-react";
import type { LibraryAssetEntry } from "@/lib/imageFactory";

/**
 * 资产库里的一张图：方图 + 悬停出下载/移除 + 底部一行标注。
 * 资产库整页和图片工厂里的模特角度板用的是同一张卡，只有「缺图时画什么」不同，
 * 所以缺图做成这里的一个分支，而不是两处各画一遍。
 */
export default function AssetThumb({
  label,
  asset,
  fileName,
  /** 缺图时格子里的说明，不填就不画占位格。 */
  missingHint,
  onOpen,
  onDelete,
}: {
  label: string;
  asset?: LibraryAssetEntry;
  fileName: string;
  missingHint?: string;
  onOpen: (asset: LibraryAssetEntry) => void;
  onDelete: (asset: LibraryAssetEntry) => void;
}) {
  if (!asset) {
    return (
      <div className="overflow-hidden rounded-2xl border border-dashed border-line-strong bg-soft">
        <div className="flex aspect-square items-center justify-center px-2 text-center text-[10px] leading-4 text-faint">
          {missingHint || "库里还没有这一张"}
        </div>
        <div className="truncate px-2 py-1.5 text-[11px] font-bold text-faint">{label}</div>
      </div>
    );
  }

  return (
    <div className="group overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="relative aspect-square bg-soft">
        <button type="button" onClick={() => onOpen(asset)} className="absolute inset-0" aria-label={`看大图：${label}`}>
          <Image src={asset.imageUrl} alt={label} fill sizes="200px" className="object-cover" />
        </button>
        <div className="pointer-events-none absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <a
            href={asset.imageUrl}
            download={fileName}
            onClick={(event) => event.stopPropagation()}
            className="rounded-lg bg-black/55 p-1.5 text-white"
            aria-label={`下载${label}`}
          >
            <Download size={12} />
          </a>
          <button
            type="button"
            onClick={() => onDelete(asset)}
            className="rounded-lg bg-black/55 p-1.5 text-white hover:bg-danger"
            aria-label={`移除${label}`}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div className="truncate px-2 py-1.5 text-[11px] font-bold text-muted">{label}</div>
    </div>
  );
}
