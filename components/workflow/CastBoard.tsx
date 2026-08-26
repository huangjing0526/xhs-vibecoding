"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload, UserRound } from "lucide-react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardHeader } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ModalOverlay from "@/components/ui/ModalOverlay";
import { listLibraryAssets } from "@/lib/workflowClient";
import { CAST_SLOTS, type CastSlot, type ProjectCast } from "@/lib/videoFactory";
import type { LibraryAssetEntry } from "@/lib/imageFactory";

interface CastBoardProps {
  projectId: string;
  cast: ProjectCast;
  busySlot: CastSlot | null;
  /** 从素材库选中一条 */
  onPickAsset: (slot: CastSlot, asset: LibraryAssetEntry) => void;
  /** 现场上传一张 */
  onUpload: (slot: CastSlot, file: File) => void;
  onClear: (slot: CastSlot) => void;
}

/** 从模特库 / 产品库里挑一条。两种库同构，只有文案不同。 */
function LibraryPicker({
  slot,
  onPick,
  onClose,
}: {
  slot: (typeof CAST_SLOTS)[number];
  onPick: (asset: LibraryAssetEntry) => void;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<LibraryAssetEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listLibraryAssets(slot.library)
      .then((list) => alive && setAssets(list))
      .catch((error) => {
        console.error("[CastBoard] 素材库读取失败", { action: "videoFactory.cast.library", library: slot.library, error });
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [slot.library]);

  return (
    <ModalOverlay onClose={onClose} maxWidthClass="max-w-2xl" ariaLabel={`选择${slot.label}`}>
      <Card>
        <CardHeader
          title={`选一个${slot.label}`}
          description={slot.library === "models" ? "图片工厂的模特库" : "图片工厂的产品库"}
          action={<Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>}
        />
        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl bg-soft p-6 text-xs text-faint">
            <Loader2 size={14} className="animate-spin" />
            正在读素材库
          </div>
        ) : assets.length === 0 ? (
          <EmptyState
            bare
            icon={<ImagePlus size={22} />}
            title={`${slot.label}库还是空的`}
            description={
              slot.library === "models"
                ? "去图片工厂用模特类模板生成一张，点「存入模特库」；或者直接在这里上传一张。"
                : "去图片工厂生成一张商品图存进产品库；或者直接在这里上传一张。"
            }
          />
        ) : (
          <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-auto sm:grid-cols-5">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onPick(asset)}
                className="overflow-hidden rounded-2xl border border-line bg-soft text-left transition-all hover:border-brand-300"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.imageUrl} alt={asset.name} className="aspect-square w-full object-cover" />
                <span className="block truncate px-2 py-1.5 text-[10px] font-semibold text-ink">{asset.name}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </ModalOverlay>
  );
}

export default function CastBoard({ projectId, cast, busySlot, onPickAsset, onUpload, onClear }: CastBoardProps) {
  const [picking, setPicking] = useState<(typeof CAST_SLOTS)[number] | null>(null);
  /** 换绑后要绕开浏览器缓存：同一个槽位的图是同名覆盖的 */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setVersion((current) => current + 1);
  }, [cast.role?.path, cast.product?.path, cast.role?.label, cast.product?.label]);

  const ready = Boolean(projectId);

  return (
    <Card>
      <CardHeader
        title="角色与产品"
        description="绑定后，每一镜的首帧图都会带上这两张当参考——这是跨镜不换脸、不换货的唯一抓手"
      />

      {!ready && (
        <Callout tone="info" className="mb-3">
          先填一下选题或拆条节奏，项目落盘后才能绑参考图。
        </Callout>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {CAST_SLOTS.map((slot) => {
          const bound = cast[slot.id];
          const busy = busySlot === slot.id;
          return (
            <div key={slot.id} className="rounded-2xl border border-line bg-soft p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink">{slot.label}</span>
                {bound && (
                  <Button size="sm" variant="danger" onClick={() => onClear(slot.id)} icon={<Trash2 size={12} />}>
                    取消
                  </Button>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-4 text-faint">{slot.hint}</p>

              <div className="mt-3 flex items-start gap-3">
                <div className="flex h-24 w-[54px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface">
                  {busy ? (
                    <Loader2 size={16} className="animate-spin text-faint" />
                  ) : bound ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/video-factory/cast?projectId=${encodeURIComponent(projectId)}&slot=${slot.id}&v=${version}`}
                      alt={bound.label}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound size={18} className="text-faint" />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  {bound && <div className="truncate text-xs font-bold text-ink">{bound.label}</div>}
                  <Button
                    size="sm"
                    variant="secondary"
                    block
                    disabled={!ready || busy}
                    onClick={() => setPicking(slot)}
                    icon={<ImagePlus size={13} />}
                  >
                    从{slot.label}库选
                  </Button>
                  <label
                    className={`flex h-8 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-xs font-bold transition-colors ${
                      ready && !busy
                        ? "cursor-pointer text-ink hover:border-brand-300 hover:bg-brand-50"
                        : "cursor-not-allowed text-faint"
                    }`}
                  >
                    <Upload size={13} />
                    上传一张
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={!ready || busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) onUpload(slot.id, file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!cast.role && !cast.product && ready && (
        <Callout tone="warn" className="mt-3">
          两个都不绑也能生成，但每一镜的人和货都会是模型现编的，接起来会明显不是同一条片子。
        </Callout>
      )}

      {picking && (
        <LibraryPicker
          slot={picking}
          onClose={() => setPicking(null)}
          onPick={(asset) => {
            onPickAsset(picking.id, asset);
            setPicking(null);
          }}
        />
      )}
    </Card>
  );
}
