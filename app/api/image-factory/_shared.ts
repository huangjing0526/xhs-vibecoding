import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { LibraryAssetEntry } from "@/lib/imageFactory";

/** 本机生图产物的存储布局：生成产物与各素材库都挂在这一个根下。 */
export const FACTORY_ROOT = path.join(process.cwd(), ".local", "image-factory");
export const JOB_ROOT = path.join(FACTORY_ROOT, "jobs");

/**
 * 可复用的参考素材库。
 * 模特和产品的存法、校验、增删完全一样，只有文案不同，所以按 kind 参数化，不各写一套。
 */
export type AssetKind = "models" | "products";

export const ASSET_LABEL: Record<AssetKind, string> = {
  models: "模特库",
  products: "产品库",
};

export function assetRoot(kind: AssetKind): string {
  return path.join(FACTORY_ROOT, kind);
}

/** 扩展名白名单与 MIME 映射合成一张表，加新格式只改这里。 */
export const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** jobId / viewId / 模特 id 来自前端，直接拼路径会有目录穿越风险，只放行这一种形态。 */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

export function isSafeSegment(value: string): boolean {
  return SAFE_SEGMENT.test(value);
}

export function safeSegment(value: string, fallback: string): string {
  return isSafeSegment(value) ? value : fallback;
}

/** 产物 id：时间前缀便于人肉排序，随机后缀避免同毫秒撞车。 */
export function newShortId(): string {
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

export function mimeByExtension(extension: string): string {
  return MIME_BY_EXTENSION[extension.toLowerCase()] || "image/png";
}

/** 把本机图片读成可直接塞进 <img> 的 data URL。 */
export async function readImageAsDataUrl(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return `data:${mimeByExtension(path.extname(filePath))};base64,${bytes.toString("base64")}`;
}

/** 目标路径是否落在指定目录内，用于挡住前端回传路径里的目录穿越。 */
export function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** 素材库索引里只存元数据，图片本体按 id 落在各自的库目录下。 */
export type AssetRecord = Omit<LibraryAssetEntry, "imageUrl">;

function assetIndexPath(kind: AssetKind): string {
  return path.join(assetRoot(kind), "index.json");
}

export function assetFilePath(kind: AssetKind, record: AssetRecord): string {
  return path.join(assetRoot(kind), `${record.id}${record.extension}`);
}

export async function readAssetIndex(kind: AssetKind): Promise<AssetRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(assetIndexPath(kind), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    // 首次使用时文件不存在是正常的，其余情况要留痕再按空库继续
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[ImageFactory] ${ASSET_LABEL[kind]}索引读取失败`, {
        userId: "local",
        action: `imageFactory.${kind}.readIndex`,
        error,
      });
    }
    return [];
  }
}

export async function writeAssetIndex(kind: AssetKind, records: AssetRecord[]) {
  await mkdir(assetRoot(kind), { recursive: true });
  await writeFile(assetIndexPath(kind), JSON.stringify(records, null, 2), "utf8");
}
