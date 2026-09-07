import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { isSafeSegment } from "@/app/api/image-factory/_shared";
import type { BloggerDistillation } from "@/lib/bloggerWorkflow";

// 读写本机磁盘，必须 nodejs runtime。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 蒸馏出来的道库落在这里，跟节奏模板同一套办法：一条一个 JSON，列目录即是模板库。
 * 不落盘的道库只活在当前这一次会话里，进不了模板目录，也就不算模板。
 */
const DAOKU_ROOT = path.join(process.cwd(), ".local", "daoku");

const entryFile = (id: string) => path.join(DAOKU_ROOT, `${id}.json`);

/** 存一份道库。id 按博主定死，所以重蒸馏是覆盖同一份，不会堆出好几条。 */
export async function POST(request: NextRequest) {
  const distillation = await readJsonBody<BloggerDistillation>(request, "daoku.save");
  const id = distillation?.id || "";
  try {
    // id 直接当文件名，路径安全校验不能省
    if (!isSafeSegment(id)) return apiBadRequest("道库 id 不合法，只能是字母、数字、下划线和连字符");
    if (!distillation.sourceLabel) return apiBadRequest("道库缺少来源名字，存不进模板目录");
    await mkdir(DAOKU_ROOT, { recursive: true });
    await writeFile(entryFile(id), JSON.stringify(distillation, null, 2), "utf8");
    console.info("[Daoku] 道库已落盘", { action: "daoku.save", id, sourceLabel: distillation.sourceLabel });
    return apiOk({ distillation }, `道库「${distillation.sourceLabel}」已存进模板`);
  } catch (error) {
    return apiError(error, "daoku.save", "道库保存失败");
  }
}

/** 存过的道库都是可复刻的模板，列出来给模板目录。 */
export async function GET() {
  try {
    let files: string[];
    try {
      files = (await readdir(DAOKU_ROOT, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return apiOk({ distillations: [] }, "还没蒸馏过道库");
    }

    const distillations = (
      await Promise.all(
        files.map(async (name) => {
          try {
            return JSON.parse(await readFile(path.join(DAOKU_ROOT, name), "utf8")) as BloggerDistillation;
          } catch (error) {
            // 单份读坏不该让整个模板目录空掉，记一笔跳过它
            console.warn("[Daoku] 跳过读不出来的道库", { action: "daoku.list", file: name, error });
            return null;
          }
        }),
      )
    )
      .filter((item): item is BloggerDistillation => Boolean(item))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return apiOk({ distillations }, `已有 ${distillations.length} 份道库模板`);
  } catch (error) {
    return apiError(error, "daoku.list", "道库模板读取失败");
  }
}

/** 删掉一份道库模板。 */
export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id") || "";
  try {
    if (!isSafeSegment(id)) return apiBadRequest("道库 id 不合法");
    const file = entryFile(id);
    await rm(file, { force: true });
    console.info("[Daoku] 道库模板已删除", { action: "daoku.delete", id });
    return apiOk({ id }, "道库模板已删除");
  } catch (error) {
    return apiError(error, "daoku.delete", "道库模板删除失败");
  }
}
