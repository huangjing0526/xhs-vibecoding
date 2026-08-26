"use client";

import { useState } from "react";
import Image from "next/image";
import { Download, Sparkles, Trash2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import ModalOverlay from "@/components/ui/ModalOverlay";
import ModelCardRow from "@/components/workflow/ModelCardRow";
import { groupInOrder } from "@/lib/collections";
import type { ImageTemplateView, ModelAssetEntry, ModelProfile } from "@/lib/imageFactory";

/**
 * 内置模特：库里已经攒齐的角度直接拿走，不用再生成。
 * 这条路和「上传参考图生成」是两件事——现成的图点一下就下载，
 * 只有库里缺的角度才值得花一次生成。
 */

/** 模板里的视角名和库里的视角名不是一一对应的，这里兜住历史叫法。 */
const LABEL_ALIASES: Record<string, string[]> = {
  定妆主图: ["定妆近景", "半身定妆"],
};

function findAsset(view: ImageTemplateView, assets: ModelAssetEntry[]): ModelAssetEntry | undefined {
  const candidates = [view.label, ...(LABEL_ALIASES[view.label] || [])];
  return assets.find((asset) => candidates.includes(asset.sourceLabel));
}

function AssetTile({
  label,
  asset,
  fileName,
  onOpen,
  onDelete,
}: {
  label: string;
  asset?: ModelAssetEntry;
  fileName: string;
  onOpen: (asset: ModelAssetEntry) => void;
  onDelete: (asset: ModelAssetEntry) => void;
}) {
  if (!asset) {
    return (
      <div className="overflow-hidden rounded-2xl border border-dashed border-line-strong bg-soft">
        <div className="flex aspect-square items-center justify-center px-2 text-center text-[10px] leading-4 text-faint">
          库里还没有这个角度
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
            aria-label={`从模特库移除${label}`}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div className="truncate px-2 py-1.5 text-[11px] font-bold text-muted">{label}</div>
    </div>
  );
}

export default function ModelLibraryBoard({
  profiles,
  loading,
  errorMessage,
  selectedName,
  views,
  onSelect,
  onDelete,
  onGenerateMissing,
}: {
  profiles: ModelProfile[];
  loading: boolean;
  errorMessage: string;
  selectedName: string;
  /** 当前模板定义的全套角度，用来对齐「该有哪些」和「库里有哪些」 */
  views: ImageTemplateView[];
  onSelect: (profile: ModelProfile) => void;
  onDelete: (asset: ModelAssetEntry) => void;
  /** 库里缺的角度交给生成那条路补 */
  onGenerateMissing: (viewIds: string[]) => void;
}) {
  const [zoomed, setZoomed] = useState<{ asset: ModelAssetEntry; label: string } | null>(null);
  const profile = profiles.find((item) => item.name === selectedName) || null;

  const matched = views.map((view) => ({ view, asset: profile ? findAsset(view, profile.assets) : undefined }));
  const missing = matched.filter((item) => !item.asset);
  const matchedIds = new Set(matched.map((item) => item.asset?.id).filter(Boolean));
  // 库里比模板多出来的角度（22°/67°、张嘴、圆唇……）也要露出来，不然等于白导
  const extras = (profile?.assets || []).filter((asset) => !matchedIds.has(asset.id));
  const groups = groupInOrder(matched, (item) => item.view.group || "全部角度");

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-bold text-ink">① 选一位模特</h2>
          <span className="text-[11px] text-faint">库里已有的角度直接拿走，不用生成</span>
        </div>
        <div className="mt-3">
          <ModelCardRow
            profiles={profiles}
            activeName={selectedName}
            loading={loading}
            size="md"
            emptyHint="模特库还是空的。用右边「生成新的」跑一组存进来，或跑导入脚本把已有模特资产导进来。"
            onSelect={onSelect}
          />
        </div>
        {errorMessage && <Callout tone="danger" className="mt-3">{errorMessage}</Callout>}
        {profile?.traits && (
          <p className="mt-3 rounded-2xl bg-soft p-2.5 text-[11px] leading-5 text-muted">{profile.traits}</p>
        )}
      </Card>

      {profile && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold text-ink">
              ② {profile.name} 的角度
              <span className="ml-2 text-[11px] font-normal text-faint">
                {profile.assets.length} 张，缺 {missing.length} 个角度
              </span>
            </h2>
            {missing.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Sparkles size={14} />}
                onClick={() => onGenerateMissing(missing.map((item) => item.view.id))}
              >
                补生成缺的 {missing.length} 个角度
              </Button>
            )}
          </div>

          {groups.map((group) => (
            <div key={group.key} className="mt-4">
              <h3 className="text-xs font-bold text-muted">
                {group.key}
                <span className="ml-1.5 font-normal text-faint">
                  {group.items.filter((item) => item.asset).length} / {group.items.length}
                </span>
              </h3>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {group.items.map(({ view, asset }) => (
                  <AssetTile
                    key={view.id}
                    label={view.label}
                    asset={asset}
                    fileName={`${profile.name}-${view.label}${asset?.extension || ".jpg"}`}
                    onOpen={(picked) => setZoomed({ asset: picked, label: view.label })}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </div>
          ))}

          {extras.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-bold text-muted">
                其它角度
                <span className="ml-1.5 font-normal text-faint">{extras.length} 张</span>
              </h3>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {extras.map((asset) => (
                  <AssetTile
                    key={asset.id}
                    label={asset.sourceLabel || "未标注"}
                    asset={asset}
                    fileName={`${profile.name}-${asset.sourceLabel}${asset.extension}`}
                    onOpen={(picked) => setZoomed({ asset: picked, label: picked.sourceLabel || profile.name })}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {zoomed && (
        <ModalOverlay onClose={() => setZoomed(null)} maxWidthClass="max-w-xl" ariaLabel={`${zoomed.label}大图`}>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-bold text-ink">{zoomed.label}</h2>
              <div className="flex shrink-0 items-center gap-1.5">
                <a
                  href={zoomed.asset.imageUrl}
                  download={`${selectedName}-${zoomed.label}${zoomed.asset.extension}`}
                  className="rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-brand-600 hover:bg-brand-50"
                >
                  下载原图
                </a>
                <button type="button" onClick={() => setZoomed(null)} className="rounded-xl p-2 text-faint hover:bg-soft hover:text-ink" aria-label="关闭">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="relative mt-3 aspect-[3/4] overflow-hidden rounded-2xl bg-soft">
              <Image src={zoomed.asset.imageUrl} alt={zoomed.label} fill sizes="600px" className="object-contain" />
            </div>
          </Card>
        </ModalOverlay>
      )}
    </div>
  );
}
