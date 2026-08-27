/**
 * 某一镜单独指定的素材：绑定、解绑、取图。
 *
 * 和项目级 cast 是覆盖关系不是取代关系——不绑就用项目级那三个槽位。
 * 换装、多产品这类片子每镜要看的东西本来就不同，三个项目级槽位表达不了；
 * 但项目级槽位又是跨镜一致性的抓手，不能丢。所以两套并存。
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { apiBadRequest, apiError, apiOk } from "@/app/api/feishu/_utils";
import { readAsset } from "@/app/api/image-factory/_assets";
import { MIME_BY_EXTENSION, mimeByExtension } from "@/app/api/image-factory/_shared";
import { isSafeSegment, projectDir, shotMaterialPath } from "@/app/api/video-factory/_shared";
import type { CastRef } from "@/lib/videoFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 每镜素材可以来自任意一个库——这一镜要看的可能是件衣服，也可能是个场景。 */
const LIBRARIES = ["models", "products", "scenes"] as const;
type Library = (typeof LIBRARIES)[number];

function readShotOrder(value: string): number | null {
  const order = Number(value);
  return Number.isInteger(order) && order > 0 && order <= 999 ? order : null;
}

/** 找出这一镜已经落盘的那张图，扩展名可能是几种之一。 */
async function findExisting(projectId: string, shotOrder: number): Promise<{ file: string; extension: string } | null> {
  for (const extension of Object.keys(MIME_BY_EXTENSION)) {
    const file = shotMaterialPath(projectId, shotOrder, extension);
    const bytes = await readFile(file).catch(() => null);
    if (bytes) return { file, extension };
  }
  return null;
}

export async function POST(request: NextRequest) {
  let projectId = "";
  try {
    const formData = await request.formData();
    projectId = String(formData.get("projectId") || "").trim();
    const shotOrder = readShotOrder(String(formData.get("shotOrder") || ""));
    const assetId = String(formData.get("assetId") || "").trim();
    const rawLibrary = String(formData.get("library") || "").trim();
    const label = String(formData.get("label") || "").trim();
    const file = formData.get("file");

    if (!isSafeSegment(projectId)) return apiBadRequest("项目 id 不合法");
    if (!shotOrder) return apiBadRequest("镜号不合法");

    const dir = projectDir(projectId);
    await mkdir(dir, { recursive: true });

    // 换绑前先清旧的，免得两种扩展名的图同时躺着，取图时撞上老的那张
    const stale = await findExisting(projectId, shotOrder);
    if (stale) await rm(stale.file, { force: true });

    let target = "";

    if (file instanceof File && file.size > 0) {
      const extension = path.extname(file.name).toLowerCase();
      if (!(extension in MIME_BY_EXTENSION)) return apiBadRequest("素材只支持 PNG / JPG / WebP");
      target = shotMaterialPath(projectId, shotOrder, extension);
      await writeFile(target, Buffer.from(await file.arrayBuffer()));
    } else if (assetId) {
      if (!LIBRARIES.includes(rawLibrary as Library)) return apiBadRequest("素材库不合法");
      // 拷进项目目录再用：库里那条以后被删了，这条片子不该跟着废
      const asset = await readAsset(rawLibrary as Library, assetId);
      if (!asset) return apiBadRequest("这条素材已不在库里，换一条或重新上传");
      target = shotMaterialPath(projectId, shotOrder, asset.extension);
      await writeFile(target, new Uint8Array(asset.bytes));
    } else {
      return apiBadRequest("选一张素材，或上传一张");
    }

    const material: CastRef = { assetId, label: label || `第 ${shotOrder} 镜素材`, path: target };
    return apiOk({ shotOrder, material }, `已绑定第 ${shotOrder} 镜的素材`);
  } catch (error) {
    console.error("[VideoFactory] 绑定分镜素材失败", { action: "videoFactory.shotMaterial.bind", projectId });
    return apiError(error, "videoFactory.shotMaterial.bind", "绑定分镜素材失败");
  }
}

/** 解绑：图一起删，不留没人引用的文件。解绑后这一镜回落到项目级 cast。 */
export async function DELETE(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId") || "";
  const shotOrder = readShotOrder(params.get("shotOrder") || "");
  try {
    if (!isSafeSegment(projectId)) return apiBadRequest("项目 id 不合法");
    if (!shotOrder) return apiBadRequest("镜号不合法");

    const existing = await findExisting(projectId, shotOrder);
    if (existing) await rm(existing.file, { force: true });
    return apiOk({ shotOrder }, `第 ${shotOrder} 镜已改回用项目素材`);
  } catch (error) {
    return apiError(error, "videoFactory.shotMaterial.clear", "取消绑定失败");
  }
}

/** 取这一镜素材的字节，给界面缩略图用；直接回图片，不套信封。 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId") || "";
  const shotOrder = readShotOrder(params.get("shotOrder") || "");
  try {
    if (!isSafeSegment(projectId)) return new NextResponse("项目 id 不合法", { status: 400 });
    if (!shotOrder) return new NextResponse("镜号不合法", { status: 400 });

    const existing = await findExisting(projectId, shotOrder);
    if (!existing) return new NextResponse("这一镜还没绑素材", { status: 404 });

    const bytes = await readFile(existing.file);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeByExtension(existing.extension),
        // 换绑会覆盖同名文件，不能长缓存
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[VideoFactory] 分镜素材读取失败", {
      userId: "local",
      action: "videoFactory.shotMaterial.image",
      projectId,
      shotOrder,
      error,
    });
    return new NextResponse("分镜素材读取失败", { status: 500 });
  }
}
