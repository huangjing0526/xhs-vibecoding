"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Library, Loader2 } from "lucide-react";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ModalOverlay from "@/components/ui/ModalOverlay";
import AssetThumb from "@/components/workflow/AssetThumb";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import { groupInOrder } from "@/lib/collections";
import { type LibraryAssetEntry } from "@/lib/imageFactory";
import { deleteLibraryAsset, listLibraryAssets } from "@/lib/workflowClient";
import type { Notice } from "./types";

/**
 * 资产库：反复要用的模特图与产品图，存在本机 .local 目录。
 * 模特库和产品库的存法与增删完全一样，只有文案不同，所以两库共用这一页，只按 kind 换词。
 */

type AssetKind = "models" | "products";

const KIND_LABEL: Record<AssetKind, string> = { models: "模特库", products: "产品库" };
const KIND_EMPTY_HINT: Record<AssetKind, string> = {
  models: "去图片工厂跑一组模特资产，在结果区点「存入模特库」，之后每次生成都能直接取这位模特。",
  products: "去图片工厂跑商品图，在结果区点「存入产品库」，之后每次生成都能锁住同一件货。",
};
const KIND_OPTIONS = (Object.keys(KIND_LABEL) as AssetKind[]).map((value) => ({ value, label: KIND_LABEL[value] }));

export default function AssetLibrary({ onNotice }: { onNotice: (notice: Notice) => void }) {
  const [kind, setKind] = useState<AssetKind>("models");
  const [assets, setAssets] = useState<LibraryAssetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [zoomed, setZoomed] = useState<LibraryAssetEntry | null>(null);

  const load = useCallback(async (target: AssetKind) => {
    setLoading(true);
    setErrorMessage("");
    try {
      setAssets(await listLibraryAssets(target));
    } catch (error) {
      console.error("[AssetLibrary] 素材库读取失败", { action: "assets.list", kind: target, error });
      setErrorMessage(error instanceof Error ? error.message : `${KIND_LABEL[target]}读取失败`);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(kind);
  }, [kind, load]);

  const handleDelete = async (asset: LibraryAssetEntry) => {
    try {
      await deleteLibraryAsset(kind, asset.id);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setZoomed((current) => (current?.id === asset.id ? null : current));
      onNotice({ type: "success", message: `已从${KIND_LABEL[kind]}移除` });
    } catch (error) {
      console.error("[AssetLibrary] 移除素材失败", { action: "assets.delete", kind, assetId: asset.id, error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "移除素材失败" });
    }
  };

  // 同名的属于同一个人 / 同一件货，成组看才知道「这位模特齐不齐」
  const groups = groupInOrder(assets, (asset) => asset.name);

  return (
    <div className="mt-6 space-y-4">
      <SegmentedControl value={kind} options={KIND_OPTIONS} onChange={setKind} ariaLabel="资产类型" />

      {errorMessage && <Callout tone="danger">{errorMessage}</Callout>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs text-faint">
          <Loader2 size={14} className="animate-spin" />
          正在读取{KIND_LABEL[kind]}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Library size={22} />}
          title={`${KIND_LABEL[kind]}还是空的`}
          description={KIND_EMPTY_HINT[kind]}
        />
      ) : (
        groups.map((group) => (
          <Card key={group.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-bold text-ink">
                {group.key}
                <span className="ml-2 text-[11px] font-normal text-faint">{group.items.length} 张</span>
              </h2>
              {group.items.find((item) => item.traits)?.traits && (
                <span className="max-w-md truncate text-[11px] text-faint">
                  {group.items.find((item) => item.traits)?.traits}
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {group.items.map((asset) => (
                <AssetThumb
                  key={asset.id}
                  label={asset.sourceLabel || "未标注"}
                  asset={asset}
                  fileName={`${asset.name}-${asset.sourceLabel || "未标注"}${asset.extension}`}
                  onOpen={setZoomed}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </Card>
        ))
      )}

      {zoomed && (
        <ModalOverlay onClose={() => setZoomed(null)} maxWidthClass="max-w-xl" ariaLabel={`${zoomed.name}大图`}>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-ink">{zoomed.name}</h2>
                <p className="mt-0.5 text-xs text-faint">{zoomed.sourceLabel || "未标注"}</p>
              </div>
              <a
                href={zoomed.imageUrl}
                download={`${zoomed.name}-${zoomed.sourceLabel || "未标注"}${zoomed.extension}`}
                className="shrink-0 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-brand-600 hover:bg-brand-50"
              >
                下载原图
              </a>
            </div>
            <div className="relative mt-3 aspect-[3/4] overflow-hidden rounded-2xl bg-soft">
              <Image src={zoomed.imageUrl} alt={zoomed.sourceLabel || zoomed.name} fill sizes="600px" className="object-contain" />
            </div>
          </Card>
        </ModalOverlay>
      )}
    </div>
  );
}
