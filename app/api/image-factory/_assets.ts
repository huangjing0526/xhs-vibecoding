import { copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  ASSET_LABEL,
  JOB_ROOT,
  MIME_BY_EXTENSION,
  assetFilePath,
  assetRoot,
  isInside,
  newShortId,
  readAssetIndex,
  writeAssetIndex,
  type AssetKind,
  type AssetRecord,
} from "@/app/api/image-factory/_shared";
import type { LibraryAssetEntry } from "@/lib/imageFactory";

/**
 * 素材库的增删查。
 * 模特库和产品库逻辑一模一样，差别只在文案，所以整套只写一遍、按 kind 参数化；
 * 各自的路由只剩 HTTP 胶水。
 */

// 单张素材上限，挡住误传的超大文件把库撑坏
const MAX_ASSET_BYTES = 12 * 1024 * 1024;

export interface SaveAssetItem {
  sourcePath: string;
  name: string;
  sourceLabel: string;
}

/** 图片不内联进 JSON：列表只回它的取图地址，浏览器自己按需拉、按 id 缓存。 */
export function toAssetEntry(kind: AssetKind, record: AssetRecord): LibraryAssetEntry {
  return { ...record, imageUrl: `/api/image-factory/${kind}/image?id=${record.id}` };
}

export async function listAssets(kind: AssetKind): Promise<LibraryAssetEntry[]> {
  return (await readAssetIndex(kind)).map((record) => toAssetEntry(kind, record));
}

/** 只允许从本机生图产物目录入库，挡住用任意路径把系统文件读进来。 */
async function copyIntoLibrary(kind: AssetKind, item: SaveAssetItem): Promise<AssetRecord> {
  const label = ASSET_LABEL[kind];
  const resolved = path.resolve(item.sourcePath);
  if (!isInside(JOB_ROOT, resolved)) throw new Error(`只能把本机生成的图片存入${label}`);

  const extension = path.extname(resolved).toLowerCase();
  if (!(extension in MIME_BY_EXTENSION)) throw new Error(`${label}只支持 PNG / JPG / WebP 图片`);

  const info = await stat(resolved);
  if (!info.isFile()) throw new Error("来源不是一张图片文件");
  if (info.size > MAX_ASSET_BYTES) throw new Error(`图片超过 12MB，无法存入${label}`);

  const record: AssetRecord = {
    id: newShortId(),
    name: item.name,
    sourceLabel: item.sourceLabel,
    createdAt: new Date().toISOString(),
    extension,
  };
  await mkdir(assetRoot(kind), { recursive: true });
  await copyFile(resolved, assetFilePath(kind, record));
  return record;
}

/** 一次运行的多个视角属于同一个主体，整组入库只读写一次索引。 */
export async function saveAssets(kind: AssetKind, items: SaveAssetItem[]): Promise<LibraryAssetEntry[]> {
  const added: AssetRecord[] = [];
  for (const item of items) added.push(await copyIntoLibrary(kind, item));

  // 新的排前面：库里最常用的是刚生成的这个
  await writeAssetIndex(kind, [...added, ...(await readAssetIndex(kind))]);
  return added.map((record) => toAssetEntry(kind, record));
}

/** 删一条素材，图片一并删掉。返回 false 表示库里本来就没有。 */
export async function deleteAsset(kind: AssetKind, assetId: string): Promise<boolean> {
  const records = await readAssetIndex(kind);
  const target = records.find((item) => item.id === assetId);
  if (!target) return false;

  await rm(assetFilePath(kind, target), { force: true });
  await writeAssetIndex(kind, records.filter((item) => item.id !== assetId));
  return true;
}

/** 取一条素材的图片字节与扩展名，给取图端点和跨模块引用（如视频工厂绑定角色）用。 */
export async function readAsset(
  kind: AssetKind,
  assetId: string,
): Promise<{ bytes: Buffer; extension: string } | null> {
  const record = (await readAssetIndex(kind)).find((item) => item.id === assetId);
  if (!record) return null;

  const bytes = await readFile(assetFilePath(kind, record)).catch(() => null);
  return bytes ? { bytes, extension: record.extension } : null;
}
