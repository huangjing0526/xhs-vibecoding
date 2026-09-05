import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { apiBadRequest, apiError, apiOk } from "@/app/api/feishu/_utils";
import { readAsset } from "@/app/api/image-factory/_assets";
import { MIME_BY_EXTENSION, mimeByExtension } from "@/app/api/image-factory/_shared";
import { castPath, isSafeSegment, projectDir } from "@/app/api/video-factory/_shared";
import { CAST_SLOTS, type CastRef, type CastSlot } from "@/lib/videoFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLOT_IDS = CAST_SLOTS.map((slot) => slot.id);
const SLOT_LABEL = Object.fromEntries(CAST_SLOTS.map((slot) => [slot.id, slot.label])) as Record<CastSlot, string>;

function readSlot(value: string): CastSlot | null {
  return SLOT_IDS.includes(value as CastSlot) ? (value as CastSlot) : null;
}

/** 找出这个槽位已经落盘的那张图（扩展名可能是几种之一）。 */
async function findExisting(projectId: string, slot: CastSlot): Promise<{ file: string; extension: string } | null> {
  for (const extension of Object.keys(MIME_BY_EXTENSION)) {
    const file = castPath(projectId, slot, extension);
    const bytes = await readFile(file).catch(() => null);
    if (bytes) return { file, extension };
  }
  return null;
}

/**
 * 绑定一个槽位。
 * 素材库里的图会拷进项目目录再用——库里那条以后被删了，这条片子也不该跟着废。
 */
export async function POST(request: NextRequest) {
  let projectId = "";
  try {
    const formData = await request.formData();
    projectId = String(formData.get("projectId") || "").trim();
    const slot = readSlot(String(formData.get("slot") || "").trim());
    const assetId = String(formData.get("assetId") || "").trim();
    const label = String(formData.get("label") || "").trim();
    const file = formData.get("file");

    if (!isSafeSegment(projectId)) return apiBadRequest("项目 id 不合法");
    if (!slot) return apiBadRequest("槽位只能是角色或产品");

    const dir = projectDir(projectId);
    await mkdir(dir, { recursive: true });

    // 换绑前先把旧的清掉，免得两种扩展名的图同时躺在目录里，取图时撞上老的那张
    const stale = await findExisting(projectId, slot);
    if (stale) await rm(stale.file, { force: true });

    let target = "";
    let extension = ".png";

    if (file instanceof File && file.size > 0) {
      extension = path.extname(file.name).toLowerCase();
      if (!(extension in MIME_BY_EXTENSION)) return apiBadRequest("参考图只支持 PNG / JPG / WebP");
      target = castPath(projectId, slot, extension);
      await writeFile(target, Buffer.from(await file.arrayBuffer()));
    } else if (assetId) {
      const library = CAST_SLOTS.find((item) => item.id === slot)!.library;
      const asset = await readAsset(library, assetId);
      if (!asset) return apiBadRequest("这条素材已不在库里，换一条或重新上传");
      extension = asset.extension;
      target = castPath(projectId, slot, extension);
      await writeFile(target, new Uint8Array(asset.bytes));
    } else {
      return apiBadRequest(`请选一张${SLOT_LABEL[slot]}参考图，或上传一张`);
    }

    const cast: CastRef = { assetId, label: label || SLOT_LABEL[slot], path: target };
    return apiOk({ slot, cast }, `已绑定${SLOT_LABEL[slot]}`);
  } catch (error) {
    console.error("[VideoFactory] 绑定参考图失败", { action: "videoFactory.cast.bind", projectId });
    return apiError(error, "videoFactory.cast.bind", "绑定参考图失败");
  }
}

/** 解绑：图一起删，免得留着个没人引用的文件。 */
export async function DELETE(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId") || "";
  const slot = readSlot(params.get("slot") || "");
  try {
    if (!isSafeSegment(projectId)) return apiBadRequest("项目 id 不合法");
    if (!slot) return apiBadRequest("槽位只能是角色或产品");

    const existing = await findExisting(projectId, slot);
    if (existing) await rm(existing.file, { force: true });
    return apiOk({ slot }, `已取消${SLOT_LABEL[slot]}`);
  } catch (error) {
    return apiError(error, "videoFactory.cast.clear", "取消绑定失败");
  }
}

/** 取绑定图的字节，给界面上的缩略图用；直接回图片，不套信封。 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId") || "";
  const slot = readSlot(params.get("slot") || "");
  try {
    if (!isSafeSegment(projectId)) return new NextResponse("项目 id 不合法", { status: 400 });
    if (!slot) return new NextResponse("槽位不合法", { status: 400 });

    const existing = await findExisting(projectId, slot);
    if (!existing) return new NextResponse("这个槽位还没绑图", { status: 404 });

    const bytes = await readFile(existing.file);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeByExtension(existing.extension),
        // 换绑会覆盖同名文件，不能长缓存
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[VideoFactory] 参考图读取失败", {
      userId: "local",
      action: "videoFactory.cast.image",
      projectId,
      slot,
      error,
    });
    return new NextResponse("参考图读取失败", { status: 500 });
  }
}
