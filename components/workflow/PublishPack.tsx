"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";
import { downloadFile } from "@/lib/download";
import { Copy, Download } from "lucide-react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import LinkButton from "@/components/workflow/LinkButton";
import CoverThumb from "@/components/workflow/CoverThumb";
import type { CoverConfig } from "@/lib/cover";
import type { QualityCheckResult } from "@/lib/qualityCheck";
import {
  buildPublishPack,
  createPublishPackZip,
  toSafeFileName,
  type PublishTextBlock,
} from "@/lib/publishPack";
import { isPublishedDraft, type ContentCard, type DraftNote } from "@/lib/xhsWorkflow";

interface PublishPackProps {
  draft: DraftNote | null;
  topic: ContentCard | null;
  /** 这篇笔记落库的封面配置，面板内现渲染成 PNG 后随包带走 */
  coverConfig: CoverConfig | null;
  /** 本次会话生成的内容配图；配图方案不落库，换一篇回来就没了 */
  contentImageDataUrl: string;
  quality: QualityCheckResult;
  onOpenCover: () => void;
  onOpenImages: () => void;
  onOpenQuality: () => void;
  onPublish: () => void;
  publishing: boolean;
}

function copyText(text: string, label: string): void {
  void copyToClipboard(text, { successMessage: `${label}已复制`, action: "publishPack.copy" });
}

function BlockCard({ block }: { block: PublishTextBlock }) {
  const lines = block.text.split("\n");
  // 卡片只做预览，长正文截到 6 行；完整内容走上面的「复制全文」
  const preview = lines.length > 6 ? `${lines.slice(0, 6).join("\n")}\n…` : block.text;
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{block.label}</h4>
        <LinkButton label="复制" onClick={() => copyText(block.text, block.label)} />
      </div>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted">{preview}</p>
    </div>
  );
}

/**
 * 发布成品包：发布这一步的落点。
 *
 * 系统不代发小红书，最后一程是人拿着成品去平台粘贴——所以这一页要让那次粘贴一次拿齐：
 * 文案整篇可复制，图连同文案打成一个 zip。「标记发布」也收在这里，
 * 让「先看成品、再标记发布」成为唯一的顺序，而不是在别处点一下就发了。
 */
export default function PublishPack({
  draft,
  topic,
  coverConfig,
  contentImageDataUrl,
  quality,
  onOpenCover,
  onOpenImages,
  onOpenQuality,
  onPublish,
  publishing,
}: PublishPackProps) {
  // 封面 PNG 由下面的 CoverThumb 现渲染回传：落库的只有配置，图要用时才画
  const [coverDataUrl, setCoverDataUrl] = useState("");

  const pack = useMemo(
    () => buildPublishPack(draft, topic, { coverDataUrl, contentImageDataUrl }),
    [contentImageDataUrl, coverDataUrl, draft, topic]
  );

  const handleDownload = useCallback(() => {
    if (!pack) return;
    try {
      downloadFile(createPublishPackZip(pack), `${toSafeFileName(pack.title)}.zip`);
      toast.success(`已打包 ${pack.images.length} 张图和文案`);
    } catch (error) {
      console.error("[PublishPack] 打包失败", { action: "publishPack.zip", title: pack.title, error });
      toast.error("打包失败，请重新生成图片后再试");
    }
  }, [pack]);

  if (!pack || !draft) {
    return (
      <Callout tone="info">这篇还没有草稿。先在项目详情页生成草稿，发布包才有内容。</Callout>
    );
  }

  const published = isPublishedDraft(draft);

  return (
    <div className="space-y-3">
      {pack.missing.length > 0 && (
        <Callout tone="warn">
          <span className="font-bold">还差几样：</span>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {pack.missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Callout>
      )}

      <div className="rounded-3xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-ink">整篇文案</h3>
            <p className="mt-0.5 text-xs text-faint">标题、正文、评论引导、标签，按小红书的顺序拼好了。</p>
          </div>
          <Button
            size="sm"
            variant="primary"
            icon={<Copy size={14} />}
            onClick={() => copyText(pack.fullText, "整篇文案")}
          >
            复制全文
          </Button>
        </div>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-soft p-3 text-xs leading-5 text-ink">
          {pack.fullText}
        </pre>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {pack.blocks.map((block) => (
          <BlockCard key={block.key} block={block} />
        ))}
      </div>

      <div className="rounded-3xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-ink">图片</h3>
            <p className="mt-0.5 text-xs text-faint">第一张是封面，下载后按文件名顺序发。</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={14} />}
            onClick={handleDownload}
            disabled={pack.images.length === 0}
          >
            打包下载
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-start gap-3">
          {coverConfig ? (
            <figure className="w-28">
              <CoverThumb
                config={coverConfig}
                className="w-28 rounded-2xl border border-line shadow-card"
                sizes="112px"
                alt="封面"
                onRendered={setCoverDataUrl}
              />
              <figcaption className="mt-1.5 text-[11px] font-bold text-faint">01 封面</figcaption>
            </figure>
          ) : (
            <div className="flex w-28 flex-col items-start gap-1.5">
              <div className="flex h-36 w-28 items-center justify-center rounded-2xl border border-dashed border-line text-[11px] text-faint">
                无封面
              </div>
              <LinkButton label="去做封面" onClick={onOpenCover} />
            </div>
          )}

          {contentImageDataUrl ? (
            <figure className="w-28">
              {/* 配图是会话里刚渲染的 PNG，直接显示；它没有落库的配置可重建 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={contentImageDataUrl}
                alt="配图"
                className="w-28 rounded-2xl border border-line shadow-card"
              />
              <figcaption className="mt-1.5 text-[11px] font-bold text-faint">02 配图</figcaption>
            </figure>
          ) : (
            <div className="flex w-28 flex-col items-start gap-1.5">
              <div className="flex h-36 w-28 items-center justify-center rounded-2xl border border-dashed border-line text-center text-[11px] leading-4 text-faint">
                无配图
                <br />
                （可选）
              </div>
              <LinkButton label="去做配图" onClick={onOpenImages} />
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 rounded-3xl border border-line bg-surface/90 p-4 shadow-raised backdrop-blur">
        {published ? (
          <p className="text-center text-xs font-bold text-ok">已发布，复盘记录已创建。</p>
        ) : (
          <>
            <Button
              block
              size="lg"
              variant="primary"
              onClick={quality.hardFail ? onOpenQuality : onPublish}
              loading={publishing}
            >
              {publishing
                ? "处理中"
                : quality.hardFail
                  ? `先过质检（${quality.failCount} 项硬伤）`
                  : "已发出去了，标记发布"}
            </Button>
            <p className="mt-2 text-center text-[11px] text-faint">
              {quality.hardFail
                ? "硬伤未清不能发布；点上面去质检处理。"
                : "标记发布只改这边的状态，不会替你发到小红书。"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
