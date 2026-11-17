"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { compressImageFile } from "@/lib/compressImage";

interface ImagePickerProps {
  value: string[];
  onChange: (images: string[]) => void;
  /** 最多几张。1 张时是「换一张」的语义，多张时是追加 */
  max?: number;
  label: string;
  hint?: string;
}

/**
 * 移动端选图：调系统相册/相机，压缩后转 data URL 交给上层。
 *
 * 不做拖拽（手机上没有拖拽），也不自己存文件——图片随生成请求一起发给本地服务，
 * 少一个上传端点就少一处会坏的地方。
 */
export default function ImagePicker({ value, onChange, max = 1, label, hint }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    setBusy(true);
    try {
      const room = max - value.length;
      const picked = Array.from(files).slice(0, max === 1 ? 1 : Math.max(0, room));
      if (picked.length === 0) {
        toast.info(`最多 ${max} 张，先删掉一张再加`);
        return;
      }

      const compressed: string[] = [];
      for (const file of picked) {
        try {
          const image = await compressImageFile(file);
          compressed.push(image.dataUrl);
        } catch (error) {
          // 单张不合格不该让整批白选，逐张提示后跳过
          console.error("[ImagePicker] 图片处理失败", {
            action: "mobile.image.compress",
            fileName: file.name,
            error,
          });
          toast.error(error instanceof Error ? error.message : "这张图处理失败");
        }
      }

      if (compressed.length === 0) return;
      onChange(max === 1 ? compressed.slice(0, 1) : [...value, ...compressed]);
    } finally {
      setBusy(false);
      // 清空 input，否则连续选同一张不会触发 change
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-bold text-ink">{label}</span>
        {hint && <span className="text-[11px] font-medium text-faint">{hint}</span>}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {value.map((image, index) => (
          <div key={index} className="relative aspect-square overflow-hidden rounded-2xl border border-line">
            {/* 本地 data URL，用 next/image 反而要额外放开配置 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={`${label} ${index + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label="删除这张"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-white"
            >
              <X size={13} strokeWidth={2.6} />
            </button>
          </div>
        ))}

        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-strong bg-surface/60 text-faint disabled:opacity-60"
          >
            <ImagePlus size={20} strokeWidth={1.8} />
            <span className="text-[11px] font-bold">{busy ? "处理中" : "添加"}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={max > 1}
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
    </div>
  );
}
