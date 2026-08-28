"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ImagePlus, Loader2, Package, Image as SceneIcon, Trash2, Upload, UserRound } from "lucide-react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardHeader } from "@/components/ui/Card";
import { LibraryPicker } from "@/components/workflow/CastBoard";
import {
  CAST_KIND_LABEL,
  castBindingProgress,
  castToken,
  type BenchmarkCastEntity,
  type BenchmarkCastKind,
  type CastBinding,
} from "@/lib/videoFactory";
import type { LibraryAssetEntry, LibraryKind } from "@/lib/imageFactory";

/** 三类实体各去哪个库挑。和 CAST_SLOTS 的 library 对齐，改一处两处都要跟着改。 */
const LIBRARY_BY_KIND: Record<BenchmarkCastKind, LibraryKind> = {
  role: "models",
  product: "products",
  scene: "scenes",
};

const ICON_BY_KIND: Record<BenchmarkCastKind, typeof UserRound> = {
  role: UserRound,
  product: Package,
  scene: SceneIcon,
};

export interface BenchmarkCastBoardProps {
  projectId: string;
  /** 拆片时认出来的实体清单 */
  cast: BenchmarkCastEntity[];
  binding: CastBinding;
  /** 正在绑的那个 token，绑定期间该行转圈 */
  busyToken: string | null;
  /** 清单里列了但没有任何一镜描述引用到的 token，绑了也换不到地方，要说清楚 */
  unusedTokens: string[];
  onBind: (
    entity: BenchmarkCastEntity,
    source: { assetId?: string; library?: LibraryKind; label: string; file?: File },
  ) => void;
  onClear: (entity: BenchmarkCastEntity) => void;
  /** 去填选题。素材要拷进项目目录，项目没落盘就绑不了，得先把人送过去 */
  onGoFillTopic: () => void;
}

/**
 * 对标实体替换台：左边是对标里有什么，右边换成你自己的。
 *
 * 和「角色 · 产品 · 场景」那块的分工：那块是三个固定槽位，没套对标时的一致性抓手；
 * 这块是套了对标之后按实体绑的，一件外套只出现在第 4、6 镜，就只管那两镜。
 * 六套换装那种片子三个槽位根本装不下，这才是它存在的理由。
 *
 * 没绑的实体不会拿对标原图去顶——那是搬运。提示词里回落成对标的类型说法（「女性模特」），
 * 画面结构照抄，主体让模型按类型自己生成。
 */
export default function BenchmarkCastBoard({
  projectId,
  cast,
  binding,
  busyToken,
  unusedTokens,
  onBind,
  onClear,
  onGoFillTopic,
}: BenchmarkCastBoardProps) {
  const [picking, setPicking] = useState<BenchmarkCastEntity | null>(null);
  /** 换绑后要绕开浏览器缓存：同一个实体的图是同名覆盖的 */
  const [version, setVersion] = useState(0);
  const bindingKey = cast.map((entity) => `${castToken(entity)}:${binding[castToken(entity)]?.path || ""}`).join();

  useEffect(() => {
    setVersion((current) => current + 1);
  }, [bindingKey]);

  if (!cast.length) return null;

  const ready = Boolean(projectId);
  const progress = castBindingProgress(cast, binding);
  const unused = new Set(unusedTokens);

  return (
    <Card>
      <CardHeader
        title="把对标里的人、货、场景换成你自己的"
        description={`拆片时认出 ${cast.length} 个可替换的实体，已换 ${progress.bound} 个 · 结构和构图照对标，主体照你绑的`}
      />

      {!ready && (
        <Callout tone="info" className="mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              素材要拷进项目目录，所以得先让项目落盘——去「脚本改写」填一下选题就行，那一步也正是把口播换成你自己的。
            </span>
            <Button size="sm" onClick={onGoFillTopic} icon={<ArrowRight size={13} />}>
              去填选题
            </Button>
          </div>
        </Callout>
      )}

      <div className="space-y-2">
        {cast.map((entity) => {
          const token = castToken(entity);
          const bound = binding[token];
          const busy = busyToken === token;
          const Icon = ICON_BY_KIND[entity.kind];
          const library = LIBRARY_BY_KIND[entity.kind];
          return (
            <div
              key={token}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-soft p-3"
            >
              {/* 左边：对标里是什么 */}
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sunken text-faint">
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-ink">{CAST_KIND_LABEL[entity.kind]}{entity.index}</span>
                    {unused.has(token) && (
                      <span className="rounded-md bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                        没有镜头用到
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-muted">
                    {entity.label}
                    {entity.shots.length > 0 && ` · 对标第 ${entity.shots.join("、")} 镜`}
                  </div>
                </div>
              </div>

              <ArrowRight size={14} className="shrink-0 text-faint" />

              {/* 右边：换成你的 */}
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface">
                  {busy ? (
                    <Loader2 size={14} className="animate-spin text-faint" />
                  ) : bound ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/video-factory/cast-entity?projectId=${encodeURIComponent(projectId)}&token=${encodeURIComponent(token)}&v=${version}`}
                      alt={bound.label}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImagePlus size={14} className="text-faint" />
                  )}
                </div>
                <div className="w-[104px] shrink-0">
                  {bound && <div className="mb-1 truncate text-[11px] font-bold text-ink">{bound.label}</div>}
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!ready || busy}
                      onClick={() => setPicking(entity)}
                    >
                      {bound ? "换" : "选"}
                    </Button>
                    <label
                      className={`inline-flex h-8 items-center justify-center rounded-xl border border-line-strong bg-surface px-2 text-xs font-bold transition-colors ${
                        ready && !busy
                          ? "cursor-pointer text-ink hover:border-brand-300 hover:bg-brand-50"
                          : "cursor-not-allowed text-faint"
                      }`}
                      title="上传一张"
                    >
                      <Upload size={12} />
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={!ready || busy}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) onBind(entity, { label: file.name.replace(/\.[^.]+$/, ""), file });
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {bound && (
                      <Button size="sm" variant="danger" disabled={busy} onClick={() => onClear(entity)}>
                        <Trash2 size={12} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {progress.pending.length > 0 && (
        <Callout tone="info" className="mt-3">
          还有 {progress.pending.join("、")} 没换。不换也能生成——那几处会照对标的类型描述让模型自己出，
          但出来的人和货每一镜都可能不一样。
        </Callout>
      )}

      {picking && (
        <LibraryPicker
          library={LIBRARY_BY_KIND[picking.kind]}
          title={`${CAST_KIND_LABEL[picking.kind]}${picking.index}（对标里是${picking.label}）`}
          onClose={() => setPicking(null)}
          onPick={(asset: LibraryAssetEntry) => {
            onBind(picking, {
              assetId: asset.id,
              library: LIBRARY_BY_KIND[picking.kind],
              label: asset.name || castToken(picking),
            });
            setPicking(null);
          }}
        />
      )}
    </Card>
  );
}
