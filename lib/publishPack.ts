import { downloadFile } from "./download";
import { createZip, dataUrlToBytes, type ZipEntry } from "./zip";
import type { ContentCard, DraftNote } from "./xhsWorkflow";

/**
 * 发布成品包：把一篇笔记散在各处的产出，收成「能直接发出去」的一份东西。
 *
 * 系统不代发小红书——发布这一步是人拿着成品去平台粘贴。所以这一层的职责是
 * 把文案拼成可整篇粘贴的形态、把图凑齐命名好，让那次粘贴不用在四个面板之间来回翻。
 */

/** 一段可单独复制的文案。整篇粘贴走 `fullText`，分块粘贴走这些。 */
export interface PublishTextBlock {
  key: "title" | "body" | "cta" | "tags";
  label: string;
  text: string;
}

export interface PublishImage {
  /** 包内文件名前缀用的序号名，也是界面上的标题 */
  label: string;
  dataUrl: string;
}

export interface PublishPack {
  /** 笔记标题，同时是 zip 的文件名来源 */
  title: string;
  blocks: PublishTextBlock[];
  /** 标题 + 正文 + 引导 + 标签，一次粘贴的全文 */
  fullText: string;
  images: PublishImage[];
  /** 还差什么才算齐活，界面照着提示 */
  missing: string[];
}

/** 标签统一带 #，人从飞书手填时可能带也可能不带。 */
function normalizeTag(tag: string): string {
  const clean = tag.trim().replace(/^#+/, "");
  return clean ? `#${clean}` : "";
}

export function formatTags(tags: string[]): string {
  return tags.map(normalizeTag).filter(Boolean).join(" ");
}

/**
 * 分块拆出这篇的可粘贴内容，顺序即小红书正文的顺序：标题 → 正文 → 评论引导 → 标签。
 * 引导和标签都是正文的一部分（平台没有单独的字段），所以它们既是块、也进整篇文案。
 */
function buildBlocks(draft: DraftNote): PublishTextBlock[] {
  return [
    { key: "title" as const, label: "标题", text: draft.title.trim() },
    { key: "body" as const, label: "正文", text: draft.content.trim() },
    { key: "cta" as const, label: "评论引导", text: draft.commentPrompt.trim() },
    { key: "tags" as const, label: "话题标签", text: formatTags(draft.tags) },
  ].filter((block) => block.text);
}

/** 整篇文案 = 各块之间空一行。由块拼出来，免得同一份内容在两处各推导一遍。 */
function buildPublishText(blocks: PublishTextBlock[]): string {
  return blocks.map((block) => block.text).join("\n\n");
}

/**
 * 组装发布包。
 *
 * 封面从落库的封面配置现渲染后由调用方传入；内容配图只有本次会话生成过才有——
 * 配图方案不落库（`/api/feishu/images` 的 writeBack 恒为 false），飞书那边只存一段文字「配图建议」。
 * 所以配图缺席是常态，不是错误，走 `missing` 提示而不是拦住整个包。
 */
export function buildPublishPack(
  draft: DraftNote | null,
  topic: ContentCard | null,
  images: { coverDataUrl: string; contentImageDataUrl: string }
): PublishPack | null {
  if (!draft) return null;

  const title = draft.title.trim() || topic?.titleCandidates[0]?.trim() || draft.noteId;
  const packImages: PublishImage[] = [];
  const missing: string[] = [];

  if (images.coverDataUrl) packImages.push({ label: "封面", dataUrl: images.coverDataUrl });
  else missing.push("还没有封面，去封面那一步生成一张");

  if (images.contentImageDataUrl) packImages.push({ label: "配图", dataUrl: images.contentImageDataUrl });
  else missing.push("这次会话还没做内容配图（配图不落库，换一篇再回来就要重做）");

  if (!draft.commentPrompt.trim()) missing.push("没有评论引导，正文末尾会少一句互动");
  if (draft.tags.filter(Boolean).length === 0) missing.push("没有话题标签，发出去很难被搜到");

  const blocks = buildBlocks(draft);

  return {
    title,
    blocks,
    fullText: buildPublishText(blocks),
    images: packImages,
    missing,
  };
}

/** 文件名里不能出现的字符换成短横，顺带压掉连续空白——中文标题原样保留。 */
export function toSafeFileName(text: string, fallback = "笔记"): string {
  const clean = text
    .replace(/[\\/:*?"<>|\n\r\t]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return clean || fallback;
}

/**
 * 打成一个 zip：图按顺序编号（发小红书时第一张就是封面），文案另存一份纯文本。
 * 编号从 1 开始并补零，好让文件管理器里的排序与发布顺序一致。
 */
export function createPublishPackZip(pack: PublishPack): Blob {
  const entries: ZipEntry[] = pack.images.map((image, index) => ({
    name: `${String(index + 1).padStart(2, "0")}-${toSafeFileName(image.label, "图片")}.png`,
    data: dataUrlToBytes(image.dataUrl),
  }));

  entries.push({
    name: "文案.txt",
    data: new TextEncoder().encode(pack.fullText),
  });

  return createZip(entries);
}
