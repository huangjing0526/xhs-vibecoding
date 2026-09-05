"use client";

import { useState } from "react";
import { Upload, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import ModalOverlay from "@/components/ui/ModalOverlay";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { LIBRARY_COPY, type LibraryAssetEntry, type LibraryKind } from "@/lib/imageFactory";
import { uploadLibraryAssets } from "@/lib/workflowClient";

/**
 * 把手上已有的图直接传进素材库。
 * 自己拍的门店、街景、商品实拍从没跑过生成，没有产物路径——
 * 只留「生成后存入」那条路的话，这类图永远进不了库。
 */
export default function AssetUploadDialog({
  kind,
  /** 从某个主体的详情页进来时带上它的名字与描述，补图不用再抄一遍 */
  presetName = "",
  presetTraits = "",
  onClose,
  onUploaded,
}: {
  kind: LibraryKind;
  presetName?: string;
  presetTraits?: string;
  onClose: () => void;
  onUploaded: (added: LibraryAssetEntry[]) => void;
}) {
  const copy = LIBRARY_COPY[kind];
  const [name, setName] = useState(presetName);
  const [sourceLabel, setSourceLabel] = useState("");
  const [traits, setTraits] = useState(presetTraits);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const submit = async () => {
    if (!name.trim()) {
      setErrorMessage(`请先填${copy.subject}名称`);
      return;
    }
    if (files.length === 0) {
      setErrorMessage("请选择要上传的图片");
      return;
    }

    setUploading(true);
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.set("name", name.trim());
      formData.set("sourceLabel", sourceLabel.trim());
      formData.set("traits", traits.trim());
      files.forEach((file) => formData.append("files", file));
      onUploaded(await uploadLibraryAssets(kind, formData));
    } catch (error) {
      console.error("[AssetUploadDialog] 上传入库失败", {
        action: `assets.${kind}.upload`,
        name: name.trim(),
        count: files.length,
        error,
      });
      setErrorMessage(error instanceof Error ? error.message : `上传到${copy.label}失败`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} maxWidthClass="max-w-md" ariaLabel={`上传到${copy.label}`}>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">上传到{copy.label}</h2>
            <p className="mt-0.5 text-[11px] text-faint">图片存在本机，不会上传到任何服务器。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-faint hover:bg-soft hover:text-ink" aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <Field label={`${copy.subject}名称`} hint={`同名的归到一个${copy.subject}下，之后按名字整组取用`}>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={`例如：${copy.subject} 1 号`} />
          </Field>

          <Field label="标注" hint={files.length > 1 ? "选了多张时各自用文件名当标注，这里填的不生效" : "可不填，不填就用文件名"}>
            <Input
              value={sourceLabel}
              onChange={(event) => setSourceLabel(event.target.value)}
              disabled={files.length > 1}
              placeholder={kind === "scenes" ? "例如：门店室内" : "例如：正面主图"}
            />
          </Field>

          <Field label="特征描述" hint={copy.traitsHint}>
            <Textarea rows={3} value={traits} onChange={(event) => setTraits(event.target.value)} placeholder={copy.traitsPlaceholder} />
          </Field>

          <div>
            <span className="mb-1.5 block text-xs font-bold text-muted">图片</span>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-soft px-3 py-4 text-xs font-bold text-muted hover:border-brand-300 hover:text-ink">
              <Upload size={14} />
              {files.length > 0 ? `已选 ${files.length} 张，点这里重选` : "选择图片，可多选"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(event) => {
                  setFiles([...(event.target.files || [])]);
                  setErrorMessage("");
                }}
              />
            </label>
            {files.length > 0 && (
              <p className="mt-1.5 truncate text-[11px] text-faint">{files.map((file) => file.name).join("、")}</p>
            )}
            <p className="mt-1.5 text-[11px] text-faint">支持 PNG / JPG / WebP，单张不超过 12MB。</p>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-3">
            <Callout tone="danger">{errorMessage}</Callout>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" loading={uploading} onClick={submit}>
            {uploading ? "正在存入" : `存入${copy.label}`}
          </Button>
        </div>
      </Card>
    </ModalOverlay>
  );
}
