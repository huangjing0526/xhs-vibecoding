"use client";

import Image from "next/image";
import { Loader2, Trash2, UserRound, X } from "lucide-react";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ModalOverlay from "@/components/ui/ModalOverlay";
import { groupModelProfiles, type ModelAssetEntry } from "@/lib/imageFactory";

/** 选中的一张模特图，连同这位模特的名字与体貌描述一起带走——下游生成靠这两样锁住身份。 */
export interface ModelPick {
  asset: ModelAssetEntry;
  name: string;
  traits: string;
}

export default function ModelLibraryPicker({
  slotLabel,
  assets,
  loading,
  errorMessage,
  onPick,
  onDelete,
  onClose,
}: {
  slotLabel: string;
  assets: ModelAssetEntry[];
  loading: boolean;
  errorMessage: string;
  onPick: (pick: ModelPick) => void;
  onDelete: (asset: ModelAssetEntry) => void;
  onClose: () => void;
}) {
  const profiles = groupModelProfiles(assets);

  return (
    <ModalOverlay onClose={onClose} maxWidthClass="max-w-2xl" ariaLabel="模特库">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">模特库</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted">挑一位模特的一张图，填进「{slotLabel}」</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl p-2 text-faint hover:bg-soft hover:text-ink" aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        {errorMessage && <Callout tone="danger" className="mt-3">{errorMessage}</Callout>}

        {loading ? (
          <div className="mt-6 flex items-center justify-center gap-2 py-10 text-xs text-faint">
            <Loader2 size={14} className="animate-spin" />
            正在读取模特库
          </div>
        ) : profiles.length === 0 ? (
          <EmptyState
            bare
            icon={<UserRound size={22} />}
            title="模特库还是空的"
            description="用「模特资产图」跑一组，填上名字与体貌描述存进来，之后所有服装类产出都能复用这位模特。"
          />
        ) : (
          <div className="mt-4 space-y-4">
            {profiles.map((profile) => (
              <div key={profile.name} className="rounded-2xl border border-line p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="truncate text-sm font-bold text-ink">{profile.name}</h3>
                  <span className="shrink-0 text-[10px] text-faint">{profile.assets.length} 张</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-faint">
                  {profile.traits || "还没写体貌描述——只靠图锁脸，换场景时容易漂"}
                </p>
                <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {profile.assets.map((asset) => (
                    <div key={asset.id} className="group">
                      <button
                        type="button"
                        onClick={() => onPick({ asset, name: profile.name, traits: profile.traits })}
                        className="relative block w-full overflow-hidden rounded-xl border border-line bg-soft transition-colors hover:border-brand-400"
                      >
                        <span className="relative block aspect-[3/4]">
                          {/* 这里不加 unoptimized：库里是整套原尺寸资产，一屏几十张得让 Next 压成缩略图才拉得动 */}
                          <Image src={asset.imageUrl} alt={asset.sourceLabel || profile.name} fill sizes="140px" className="object-cover" />
                        </span>
                      </button>
                      <div className="mt-1 flex items-start justify-between gap-1">
                        <p className="truncate text-[10px] text-faint" title={asset.sourceLabel}>{asset.sourceLabel || "未标注视角"}</p>
                        <button
                          type="button"
                          onClick={() => onDelete(asset)}
                          className="shrink-0 rounded-md p-0.5 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                          aria-label={`移除${profile.name}的这张图`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </ModalOverlay>
  );
}
