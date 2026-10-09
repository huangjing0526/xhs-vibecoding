import path from "node:path";
import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { readJsonFile, writeJsonFile } from "@/app/api/_localJson";
import { isSafeSegment } from "@/app/api/image-factory/_shared";
import type { NoteAssets } from "@/lib/noteAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 一个项目（按选题）在本机存的产出：配图方案、视频方案。
 * 草稿表没有放方案 JSON 的列（加列算改表），先和道库绑定一样落本机；图不存，用时按方案现画，同封面。
 */
const NOTES_ROOT = path.join(process.cwd(), ".local", "notes");
const noteFile = (topicId: string) => path.join(NOTES_ROOT, `${topicId}.json`);

export async function GET(request: NextRequest) {
  const topicId = request.nextUrl.searchParams.get("topicId") || "";
  try {
    // 选题ID 直接当文件名，路径安全校验不能省
    if (!isSafeSegment(topicId)) return apiBadRequest("选题ID 不合法");
    return apiOk({ assets: await readJsonFile<NoteAssets>(noteFile(topicId), {}) }, "已读取项目产出");
  } catch (error) {
    return apiError(error, "notes.assets.read", "读取项目产出失败");
  }
}

/** 合并写：只带了配图就只更新配图，另一样保持原样。传 null 表示清掉那一样。 */
export async function PUT(request: NextRequest) {
  const body = await readJsonBody<{ topicId?: string } & NoteAssets>(request, "notes.assets.readJson");
  const topicId = body.topicId || "";
  try {
    if (!isSafeSegment(topicId)) return apiBadRequest("选题ID 不合法");
    const current = await readJsonFile<NoteAssets>(noteFile(topicId), {});
    const next: NoteAssets = {
      contentImagePlan: body.contentImagePlan !== undefined ? body.contentImagePlan : current.contentImagePlan,
      videoPlan: body.videoPlan !== undefined ? body.videoPlan : current.videoPlan,
    };
    await writeJsonFile(noteFile(topicId), next);
    return apiOk({ assets: next }, "项目产出已保存");
  } catch (error) {
    return apiError(error, "notes.assets.write", "保存项目产出失败");
  }
}
