"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowLeft, Library, Loader2, Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ModalOverlay from "@/components/ui/ModalOverlay";
import AssetProfileCard from "@/components/workflow/AssetProfileCard";
import AssetThumb from "@/components/workflow/AssetThumb";
import AssetUploadDialog from "@/components/workflow/AssetUploadDialog";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import {
  groupAssetProfiles,
  LIBRARY_COPY,
  LIBRARY_KINDS,
  type LibraryAssetEntry,
  type LibraryKind,
} from "@/lib/imageFactory";
import { deleteLibraryAsset, listLibraryAssets } from "@/lib/workflowClient";
import type { Notice } from "./types";

/**
 * 资产库：反复要用的模特图、产品图与场景图，存在本机 .local 目录。
 * 三种库的存法与增删完全一样，只有文案不同，所以共用这一页，只按 kind 换词。
 *
 * 页面分两层：列表只回答「库里都有谁」，一个主体一张封面卡；
 * 「这位模特有哪些角度」是进详情才问的问题——摊在列表上，一屏就只剩两个主体。
 */

const KIND_OPTIONS = LIBRARY_KINDS.map((value) => ({ value, label: LIBRARY_COPY[value].label }));

export default function AssetLibrary({ onNotice }: { onNotice: (notice: Notice) => void }) {
  const [kind, setKind] = useState<LibraryKind>("models");
  const [assets, setAssets] = useState<LibraryAssetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  /** 正在看哪个主体的详情；空串表示停在列表层 */
  const [openName, setOpenName] = useState("");
  const [zoomed, setZoomed] = useState<LibraryAssetEntry | null>(null);
  const [uploading, setUploading] = useState(false);
  const [traitsOpen, setTraitsOpen] = useState(false);

  const copy = LIBRARY_COPY[kind];

  const load = useCallback(async (target: LibraryKind) => {
    setLoading(true);
    setErrorMessage("");
    try {
      setAssets(await listLibraryAssets(target));
    } catch (error) {
      console.error("[AssetLibrary] 素材库读取失败", { action: "assets.list", kind: target, error });
      setErrorMessage(error instanceof Error ? error.message : `${LIBRARY_COPY[target].label}读取失败`);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(kind);
  }, [kind, load]);

  const openDetail = (name: string) => {
    setOpenName(name);
    setTraitsOpen(false);
  };

  const switchKind = (next: LibraryKind) => {
    setKind(next);
    setOpenName("");
    setZoomed(null);
  };

  const handleDelete = async (asset: LibraryAssetEntry) => {
    try {
      await deleteLibraryAsset(kind, asset.id);
      const rest = assets.filter((item) => item.id !== asset.id);
      setAssets(rest);
      setZoomed((current) => (current?.id === asset.id ? null : current));
      // 删掉的是这个主体的最后一张，详情页就没内容可看了，退回列表
      if (!rest.some((item) => item.name === openName)) setOpenName("");
      onNotice({ type: "success", message: `已从${copy.label}移除` });
    } catch (error) {
      console.error("[AssetLibrary] 移除素材失败", { action: "assets.delete", kind, assetId: asset.id, error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "移除素材失败" });
    }
  };

  const handleUploaded = (added: LibraryAssetEntry[]) => {
    setUploading(false);
    if (added.length === 0) return;
    // 新的排前面，和服务端索引一致
    setAssets((current) => [...added, ...current]);
    openDetail(added[0].name);
    onNotice({ type: "success", message: `已存入${copy.label} ${added.length} 张` });
  };

  // 同名的属于同一个主体，成组看才知道「这位齐不齐」
  const profiles = useMemo(() => groupAssetProfiles(assets, kind), [assets, kind]);
  const openProfile = profiles.find((profile) => profile.name === openName) || null;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl value={kind} options={KIND_OPTIONS} onChange={switchKind} ariaLabel="资产类型" />
        <Button size="sm" icon={<Upload size={14} />} onClick={() => setUploading(true)}>
          上传到{copy.label}
        </Button>
      </div>

      {errorMessage && <Callout tone="danger">{errorMessage}</Callout>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs text-faint">
          <Loader2 size={14} className="animate-spin" />
          正在读取{copy.label}
        </div>
      ) : openProfile ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setOpenName("")}
                className="-ml-1 inline-flex items-center gap-1 rounded-xl px-1 py-0.5 text-[11px] font-bold text-brand-600 hover:bg-brand-50"
              >
                <ArrowLeft size={12} />
                返回{copy.label}
              </button>
              <h2 className="mt-1 truncate text-[15px] font-bold text-ink">
                {openProfile.name}
                <span className="ml-2 text-[11px] font-normal text-faint">{openProfile.assets.length} 张</span>
              </h2>
            </div>
            <Button size="sm" variant="ghost" icon={<Upload size={14} />} onClick={() => setUploading(true)}>
              补充上传
            </Button>
          </div>
          {openProfile.traits && (
            // 身份档案能写到十几行，默认收成两行；要核对细节再展开，不然图全被挤到屏幕外
            <button
              type="button"
              onClick={() => setTraitsOpen((current) => !current)}
              className="mt-2 block w-full rounded-xl bg-soft px-3 py-2 text-left text-[11px] leading-5 text-faint hover:text-muted"
            >
              <span className={traitsOpen ? "" : "line-clamp-2"}>{openProfile.traits}</span>
              <span className="mt-1 block text-[10px] font-bold text-brand-600">{traitsOpen ? "收起" : "展开全部"}</span>
            </button>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
            {openProfile.assets.map((asset) => (
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
      ) : profiles.length === 0 ? (
        <EmptyState
          icon={<Library size={22} />}
          title={`${copy.label}还是空的`}
          description={copy.emptyHint}
          action={
            <Button size="sm" icon={<Upload size={14} />} onClick={() => setUploading(true)}>
              上传第一张
            </Button>
          }
        />
      ) : (
        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {profiles.map((profile) => (
              <AssetProfileCard
                key={profile.name}
                profile={profile}
                kind={kind}
                onOpen={(picked) => openDetail(picked.name)}
              />
            ))}
          </div>
        </Card>
      )}

      {uploading && (
        <AssetUploadDialog
          kind={kind}
          presetName={openProfile?.name || ""}
          presetTraits={openProfile?.traits || ""}
          onClose={() => setUploading(false)}
          onUploaded={handleUploaded}
        />
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
