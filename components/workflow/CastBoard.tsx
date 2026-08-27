"use client";

import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, ImagePlus, Loader2, Package, Search, Trash2, Upload, UserRound } from "lucide-react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardHeader } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import ModalOverlay from "@/components/ui/ModalOverlay";
import { listLibraryAssets } from "@/lib/workflowClient";
import { CAST_SLOTS, type CastSlot, type ProjectCast } from "@/lib/videoFactory";
import { LIBRARY_COPY, groupAssetProfiles, type LibraryAssetEntry } from "@/lib/imageFactory";

/** 超过这个数才显出搜索框：只存了三五个主体时，一个空搜索框只是噪音。 */
const SEARCH_THRESHOLD = 6;

/** 槽位空着时摆的占位图标。图标不进 CAST_SLOTS——那是纯数据契约，不该把 lucide 拖进去。 */
const SLOT_ICON: Record<CastSlot, typeof UserRound> = {
  role: UserRound,
  product: Package,
  scene: ImageIcon,
};

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

/**
 * 从模特库 / 产品库 / 场景库里挑一条。三种库同构，只有文案不同。
 *
 * 按「档案」而不是按「图」平铺：库里一位模特存着定妆、正面、全身十来张，
 * 平铺出来就是同一个人占满整屏，人得先在一堆重复里找出这是谁。
 * groupAssetProfiles 归档后一个主体只占一格，封面也由它按视角优先级挑（脸 > 全身）。
 */
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
  const [keyword, setKeyword] = useState("");

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

  const copy = LIBRARY_COPY[slot.library];
  const profiles = useMemo(() => groupAssetProfiles(assets, slot.library), [assets, slot.library]);
  // 名字和特征描述都能搜：场景多半没起过名字，靠「门店」「雪」这类词从描述里捞更快
  const matched = useMemo(() => {
    const word = keyword.trim().toLowerCase();
    if (!word) return profiles;
    return profiles.filter(
      (profile) =>
        profile.name.toLowerCase().includes(word) || profile.traits.toLowerCase().includes(word),
    );
  }, [profiles, keyword]);

  return (
    <ModalOverlay onClose={onClose} maxWidthClass="max-w-2xl" ariaLabel={`选择${slot.label}`}>
      <Card>
        <CardHeader
          title={`选一个${slot.label}`}
          description={`图片工厂的${copy.label}${profiles.length ? ` · 已存 ${profiles.length} 个${copy.subject}` : ""}`}
          action={<Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>}
        />
        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl bg-soft p-6 text-xs text-faint">
            <Loader2 size={14} className="animate-spin" />
            正在读素材库
          </div>
        ) : profiles.length === 0 ? (
          <EmptyState
            bare
            icon={<ImagePlus size={22} />}
            title={`${copy.label}还是空的`}
            description={`${copy.emptyHint}也可以直接在这里上传一张。`}
          />
        ) : (
          <>
            {profiles.length > SEARCH_THRESHOLD && (
              <div className="relative mb-3">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <Input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder={`搜${copy.subject}名称或特征`}
                  className="pl-9"
                />
              </div>
            )}
            {matched.length === 0 ? (
              <EmptyState bare icon={<Search size={22} />} title="没有匹配的" description="换个词，或者清空搜索框看全部。" />
            ) : (
              <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-auto sm:grid-cols-5">
                {matched.map((profile) => (
                  <button
                    key={profile.name}
                    type="button"
                    onClick={() => onPick(profile.cover)}
                    title={profile.traits || profile.name}
                    className="overflow-hidden rounded-2xl border border-line bg-soft text-left transition-all hover:border-brand-300"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={profile.cover.imageUrl} alt={profile.name} className="aspect-square w-full object-cover" />
                    <span className="block truncate px-2 py-1.5 text-[10px] font-semibold text-ink">{profile.name}</span>
                    {profile.assets.length > 1 && (
                      <span className="block px-2 pb-1.5 text-[10px] text-faint">{profile.assets.length} 张</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </ModalOverlay>
  );
}

export default function CastBoard({ projectId, cast, busySlot, onPickAsset, onUpload, onClear }: CastBoardProps) {
  const [picking, setPicking] = useState<(typeof CAST_SLOTS)[number] | null>(null);
  /** 换绑后要绕开浏览器缓存：同一个槽位的图是同名覆盖的 */
  const [version, setVersion] = useState(0);
  /** 所有槽位的绑定状态压成一个键，加槽位时不用再回来补依赖 */
  const castKey = CAST_SLOTS.map((slot) => `${cast[slot.id]?.path || ""}|${cast[slot.id]?.label || ""}`).join();

  useEffect(() => {
    setVersion((current) => current + 1);
  }, [castKey]);

  const ready = Boolean(projectId);

  return (
    <Card>
      <CardHeader
        title="角色 · 产品 · 场景"
        description="绑定后，每一镜的首帧图都会带上这几张当参考——这是跨镜不换脸、不换货、不换地方的唯一抓手"
      />

      {!ready && (
        <Callout tone="info" className="mb-3">
          先填一下选题或拆条节奏，项目落盘后才能绑参考图。
        </Callout>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {CAST_SLOTS.map((slot) => {
          const bound = cast[slot.id];
          const busy = busySlot === slot.id;
          const SlotIcon = SLOT_ICON[slot.id];
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
                    <SlotIcon size={18} className="text-faint" />
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
                    从{LIBRARY_COPY[slot.library].label}选
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

      {CAST_SLOTS.every((slot) => !cast[slot.id]) && ready && (
        <Callout tone="warn" className="mt-3">
          全都不绑也能生成，但每一镜的人、货和场景都会是模型现编的，接起来会明显不是同一条片子。
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
