import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
 * 模特库、产品库、场景库逻辑一模一样，差别只在文案，所以整套只写一遍、按 kind 参数化；
 * 各自的路由只剩 HTTP 胶水。
 */

// 单张素材上限，挡住误传的超大文件把库撑坏
const MAX_ASSET_BYTES = 12 * 1024 * 1024;

/** 入库时都要填的那几项，两条入库路径（本机产物 / 上传）共用。 */
interface AssetMeta {
  name: string;
  sourceLabel: string;
  /** 主体特征描述，入库时一并记下，后续生成时随图一起喂给 CLI。 */
  traits?: string;
}

/** 从本机生图产物入库。 */
export interface SaveAssetItem extends AssetMeta {
  sourcePath: string;
}

/** 从浏览器上传入库：手上已有的参考图（自己拍的门店、商品实拍）没跑过生成，没有产物路径。 */
export interface UploadAssetItem extends AssetMeta {
  bytes: Buffer;
  fileName: string;
}

/** 图片不内联进 JSON：列表只回它的取图地址，浏览器自己按需拉、按 id 缓存。 */
export function toAssetEntry(kind: AssetKind, record: AssetRecord): LibraryAssetEntry {
  return { ...record, imageUrl: `/api/image-factory/${kind}/image?id=${record.id}` };
}

export async function listAssets(kind: AssetKind): Promise<LibraryAssetEntry[]> {
  return (await readAssetIndex(kind)).map((record) => toAssetEntry(kind, record));
}

/** 扩展名白名单在两条入库路径上都要卡一遍，写一处。 */
function assetExtension(kind: AssetKind, fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (!(extension in MIME_BY_EXTENSION)) throw new Error(`${ASSET_LABEL[kind]}只支持 PNG / JPG / WebP 图片`);
  return extension;
}

function newRecord(meta: AssetMeta, extension: string): AssetRecord {
  return {
    id: newShortId(),
    name: meta.name,
    sourceLabel: meta.sourceLabel,
    createdAt: new Date().toISOString(),
    extension,
    ...(meta.traits ? { traits: meta.traits } : {}),
  };
}

/** 只允许从本机生图产物目录入库，挡住用任意路径把系统文件读进来。 */
async function copyIntoLibrary(kind: AssetKind, item: SaveAssetItem): Promise<AssetRecord> {
  const label = ASSET_LABEL[kind];
  const resolved = path.resolve(item.sourcePath);
  if (!isInside(JOB_ROOT, resolved)) throw new Error(`只能把本机生成的图片存入${label}`);

  const extension = assetExtension(kind, resolved);
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error("来源不是一张图片文件");
  if (info.size > MAX_ASSET_BYTES) throw new Error(`图片超过 12MB，无法存入${label}`);

  const record = newRecord(item, extension);
  await mkdir(assetRoot(kind), { recursive: true });
  await copyFile(resolved, assetFilePath(kind, record));
  return record;
}

/**
 * 上传入库：图片字节由浏览器直接传上来，不经过生图产物目录。
 * 场景参考图多半是自己拍的，从没跑过生成，只认产物路径的话它永远进不了库。
 */
async function writeIntoLibrary(kind: AssetKind, item: UploadAssetItem): Promise<AssetRecord> {
  const extension = assetExtension(kind, item.fileName);
  if (item.bytes.length === 0) throw new Error("这张图是空的，换一张");
  if (item.bytes.length > MAX_ASSET_BYTES) throw new Error(`图片超过 12MB，无法存入${ASSET_LABEL[kind]}`);

  const record = newRecord(item, extension);
  await mkdir(assetRoot(kind), { recursive: true });
  await writeFile(assetFilePath(kind, record), new Uint8Array(item.bytes));
  return record;
}

/** 新的排前面：库里最常用的是刚存进去的这批。 */
async function appendAssets(kind: AssetKind, added: AssetRecord[]): Promise<LibraryAssetEntry[]> {
  await writeAssetIndex(kind, [...added, ...(await readAssetIndex(kind))]);
  return added.map((record) => toAssetEntry(kind, record));
}

/** 一次运行的多个视角属于同一个主体，整组入库只读写一次索引。 */
export async function saveAssets(kind: AssetKind, items: SaveAssetItem[]): Promise<LibraryAssetEntry[]> {
  const added: AssetRecord[] = [];
  for (const item of items) added.push(await copyIntoLibrary(kind, item));
  return appendAssets(kind, added);
}

/** 一次选中的多张上传图同样归到一个主体名下，整批入库只读写一次索引。 */
export async function uploadAssets(kind: AssetKind, items: UploadAssetItem[]): Promise<LibraryAssetEntry[]> {
  const added: AssetRecord[] = [];
  for (const item of items) added.push(await writeIntoLibrary(kind, item));
  return appendAssets(kind, added);
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
