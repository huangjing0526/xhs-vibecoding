"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import { LibraryPicker } from "@/components/workflow/CastBoard";
import { LIBRARY_KINDS, LIBRARY_COPY, type LibraryAssetEntry, type LibraryKind } from "@/lib/imageFactory";
import type { CastRef } from "@/lib/videoFactory";

interface ShotMaterialSlotProps {
  projectId: string;
  shotOrder: number;
  material?: CastRef;
  busy: boolean;
  onPickAsset: (library: LibraryKind, asset: LibraryAssetEntry) => void;
  onUpload: (file: File) => void;
  onClear: () => void;
}

/**
 * 这一镜单独用哪张素材。
 *
 * 不填是常态：项目级的角色/产品/场景已经管住了跨镜一致性，
 * 只有「这一镜要看的东西和别镜不同」才需要单独指。
 * 所以默认态是一行小字加两个按钮，不占分镜卡的版面。
 */
export default function ShotMaterialSlot({
  projectId,
  shotOrder,
  material,
  busy,
  onPickAsset,
  onUpload,
  onClear,
}: ShotMaterialSlotProps) {
  const [picking, setPicking] = useState<LibraryKind | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = Boolean(projectId);

  return (
    <div className="mt-3 rounded-xl border border-line bg-soft px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface">
          {busy ? (
            <Loader2 size={13} className="animate-spin text-faint" />
          ) : material ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/video-factory/shot-material?projectId=${encodeURIComponent(projectId)}&shotOrder=${shotOrder}&t=${encodeURIComponent(material.path)}`}
              alt={material.label}
              className="h-full w-full object-cover"
            />
          ) : (
            <ImagePlus size={14} className="text-faint" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-ink">
            {material ? material.label : "本镜素材"}
          </div>
          <p className="mt-0.5 text-[11px] leading-4 text-faint">
            {material
              ? "这一镜的首帧会以它为准，项目级的角色/产品/场景退到后面兜底。"
              : "不填就用项目级的角色/产品/场景。只有这一镜要看的东西和别镜不同才需要单独指。"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {material ? (
            <Button size="sm" variant="danger" onClick={onClear} icon={<Trash2 size={12} />} disabled={busy}>
              取消
            </Button>
          ) : (
            <>
              {LIBRARY_KINDS.map((library) => (
                <Button
                  key={library}
                  size="sm"
                  variant="ghost"
                  disabled={!ready || busy}
                  onClick={() => setPicking(library)}
                >
                  {LIBRARY_COPY[library].subject}
                </Button>
              ))}
              <Button
                size="sm"
                variant="secondary"
                disabled={!ready || busy}
                onClick={() => fileRef.current?.click()}
                icon={<Upload size={12} />}
              >
                上传
              </Button>
            </>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // 清掉 value，不然选同一个文件两次不会再触发 change
          event.target.value = "";
          if (file) onUpload(file);
        }}
      />

      {picking && (
        <LibraryPicker
          library={picking}
          title={`第 ${shotOrder} 镜的素材`}
          onClose={() => setPicking(null)}
          onPick={(asset) => {
            onPickAsset(picking, asset);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
