import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ModelAssetEntry } from "@/lib/imageFactory";

/** 本机生图产物的存储布局：生成产物与模特库都挂在这一个根下。 */
export const FACTORY_ROOT = path.join(process.cwd(), ".local", "image-factory");
export const JOB_ROOT = path.join(FACTORY_ROOT, "jobs");
export const MODEL_ROOT = path.join(FACTORY_ROOT, "models");

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

/** 模特库索引里只存元数据，图片本体按 id 落在 MODEL_ROOT 下。 */
export type ModelAssetRecord = Omit<ModelAssetEntry, "imageUrl">;

const MODEL_INDEX_PATH = path.join(MODEL_ROOT, "index.json");

export function modelAssetPath(record: ModelAssetRecord): string {
  return path.join(MODEL_ROOT, `${record.id}${record.extension}`);
}

export async function readModelIndex(): Promise<ModelAssetRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(MODEL_INDEX_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    // 首次使用时文件不存在是正常的，其余情况要留痕再按空库继续
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[ImageFactory] 模特库索引读取失败", { userId: "local", action: "imageFactory.models.readIndex", error });
    }
    return [];
  }
}

export async function writeModelIndex(records: ModelAssetRecord[]) {
  await mkdir(MODEL_ROOT, { recursive: true });
  await writeFile(MODEL_INDEX_PATH, JSON.stringify(records, null, 2), "utf8");
}
