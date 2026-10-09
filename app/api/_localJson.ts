import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** 读本机 .local 下的一份 JSON；文件还没建过时给 fallback，其余读错照常抛给调用方。 */
export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

/** 写一份 JSON，目录不存在就先建。 */
export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}
