"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Library, Loader2, X } from "lucide-react";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ModalOverlay from "@/components/ui/ModalOverlay";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import { LIBRARY_COPY, LIBRARY_KINDS, type LibraryAssetEntry, type LibraryKind } from "@/lib/imageFactory";
import { listLibraryAssets } from "@/lib/workflowClient";

/**
 * 从资产库取一张图填进槽位。
 *
 * 资产的整条价值就在「存一次、反复用」，可这边一度只剩上传：存进去的模特在工厂里取不出来，
 * 只能下载再传一遍，等于把库变成了单向的垃圾桶。这个弹层就是把取用那半边接回来。
 *
 * 不做成「进来先挑一位模特」——那是反的，样例只说明结构，主体该由人自己决定从哪来。
 * 所以它是槽位旁边的一条可选路径，跟「上传」平级，不抢默认。
 */
export default function AssetPickerDialog({
  slotLabel,
  onPick,
  onClose,
}: {
  slotLabel: string;
  /** 选中一条：调用方负责把它取成文件填进槽位。 */
  onPick: (entry: LibraryAssetEntry, kind: LibraryKind) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<LibraryKind>(LIBRARY_KINDS[0]);
  const [assets, setAssets] = useState<LibraryAssetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setErrorMessage("");
    listLibraryAssets(kind)
      .then((loaded) => {
        if (!ignore) setAssets(loaded);
      })
      .catch((error) => {
        console.error("[AssetPickerDialog] 资产读取失败", { action: "assets.list", kind, error });
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "资产读取失败");
          setAssets([]);
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [kind]);

  const copy = LIBRARY_COPY[kind];

  return (
    <ModalOverlay onClose={onClose} maxWidthClass="max-w-2xl" ariaLabel="从资产里选">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">从资产里选</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted">挑一张填进「{slotLabel}」</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-faint hover:bg-soft hover:text-ink"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-3">
          <SegmentedControl
            value={kind}
            onChange={setKind}
            ariaLabel="选哪个库"
            options={LIBRARY_KINDS.map((item) => ({ value: item, label: LIBRARY_COPY[item].label }))}
          />
        </div>

        {errorMessage && (
          <Callout tone="danger" className="mt-3">
            {errorMessage}
          </Callout>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-faint">
            <Loader2 size={16} className="animate-spin" />
            读取中
          </div>
        ) : assets.length === 0 ? (
          <div className="py-6">
            <EmptyState icon={<Library size={22} />} title={`${copy.label}还是空的`} description={copy.emptyHint} bare />
          </div>
        ) : (
          <div className="mt-3 grid max-h-[52vh] grid-cols-2 gap-3 overflow-auto sm:grid-cols-3">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onPick(asset, kind)}
                className="overflow-hidden rounded-2xl border border-line bg-surface text-left transition-colors hover:border-brand-300"
              >
                <div className="relative aspect-[3/4] bg-soft">
                  <Image src={asset.imageUrl} alt={asset.name} fill sizes="200px" className="object-cover" unoptimized />
                </div>
                <div className="px-2.5 py-2">
                  <div className="truncate text-xs font-bold text-ink">{asset.name}</div>
                  {/* 特征描述是这条资产之所以是资产的凭据，挑的时候就该看得见 */}
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-faint">
                    {asset.traits || asset.sourceLabel}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </ModalOverlay>
  );
}
