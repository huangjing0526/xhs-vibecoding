import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import {
  JOB_ROOT,
  MIME_BY_EXTENSION,
  MODEL_ROOT,
  isInside,
  isSafeSegment,
  modelAssetPath,
  newShortId,
  readModelIndex,
  writeModelIndex,
  type ModelAssetRecord,
} from "@/app/api/image-factory/_shared";
import type { ModelAssetEntry } from "@/lib/imageFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 单张模特图上限，挡住误传的超大文件把库撑坏
const MAX_ASSET_BYTES = 12 * 1024 * 1024;

interface SaveItem {
  sourcePath: string;
  name: string;
  sourceLabel: string;
}

/** 图片不内联进 JSON：列表只回它的取图地址，浏览器自己按需拉、按 id 缓存。 */
function toEntry(record: ModelAssetRecord): ModelAssetEntry {
  return { ...record, imageUrl: `/api/image-factory/models/image?id=${record.id}` };
}

/** 只允许从本机生图产物目录入库，挡住用任意路径把系统文件读进来。 */
async function copyIntoLibrary(item: SaveItem): Promise<ModelAssetRecord> {
  const resolved = path.resolve(item.sourcePath);
  if (!isInside(JOB_ROOT, resolved)) throw new Error("只能把本机生成的图片存入模特库");

  const extension = path.extname(resolved).toLowerCase();
  if (!(extension in MIME_BY_EXTENSION)) throw new Error("模特库只支持 PNG / JPG / WebP 图片");

  const info = await stat(resolved);
  if (!info.isFile()) throw new Error("来源不是一张图片文件");
  if (info.size > MAX_ASSET_BYTES) throw new Error("图片超过 12MB，无法存入模特库");

  const record: ModelAssetRecord = {
    id: newShortId(),
    name: item.name,
    sourceLabel: item.sourceLabel,
    createdAt: new Date().toISOString(),
    extension,
  };
  await mkdir(MODEL_ROOT, { recursive: true });
  await copyFile(resolved, modelAssetPath(record));
  return record;
}

export async function GET() {
  try {
    const records = await readModelIndex();
    return apiOk({ models: records.map(toEntry) }, "模特库读取成功");
  } catch (error) {
    return apiError(error, "imageFactory.models.list", "模特库读取失败");
  }
}

/** 一次运行的多个视角属于同一位模特，整组入库只读写一次索引。 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<{ items?: SaveItem[] }>(request, "imageFactory.models.save");
    const items = (body.items || [])
      .map((item) => ({
        sourcePath: String(item?.sourcePath || "").trim(),
        name: String(item?.name || "").trim(),
        sourceLabel: String(item?.sourceLabel || "").trim(),
      }))
      .filter((item) => item.sourcePath && item.name);
    if (items.length === 0) return apiBadRequest("请填写模特名称后再入库");

    const added: ModelAssetRecord[] = [];
    for (const item of items) added.push(await copyIntoLibrary(item));

    // 新的排前面：库里最常用的是刚生成的这位模特
    await writeModelIndex([...added, ...(await readModelIndex())]);
    return apiOk({ models: added.map(toEntry) }, `已存入模特库 ${added.length} 张`);
  } catch (error) {
    return apiError(error, "imageFactory.models.save", "存入模特库失败");
  }
}

export async function DELETE(request: NextRequest) {
  const modelId = new URL(request.url).searchParams.get("id") || "";
  try {
    if (!isSafeSegment(modelId)) return apiBadRequest("模特 id 不合法");

    const records = await readModelIndex();
    const target = records.find((item) => item.id === modelId);
    if (!target) return apiBadRequest("这条模特资产已不在库里");

    await rm(modelAssetPath(target), { force: true });
    await writeModelIndex(records.filter((item) => item.id !== modelId));
    return apiOk({ id: modelId }, "已从模特库移除");
  } catch (error) {
    return apiError(error, "imageFactory.models.delete", "移除模特失败");
  }
}
