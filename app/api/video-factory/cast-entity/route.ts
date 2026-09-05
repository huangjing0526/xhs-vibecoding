/**
 * 对标实体的素材绑定：把「角色1」「产品2」这些占位符绑到你自己的图上。
 *
 * 和项目级 cast 的分工：cast 是三个固定槽位，没套对标时唯一的一致性抓手；
 * 这套是套了对标之后按实体绑的，一个实体出现在哪几镜就管哪几镜——
 * 六套换装那种片子，三个槽位根本表达不了六件衣服。
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { apiBadRequest, apiError, apiOk } from "@/app/api/feishu/_utils";
import { readAsset } from "@/app/api/image-factory/_assets";
import { MIME_BY_EXTENSION, mimeByExtension } from "@/app/api/image-factory/_shared";
import { castEntityPath, isSafeSegment, projectDir } from "@/app/api/video-factory/_shared";
import { castTokenSlug, parseCastToken, type CastRef } from "@/lib/videoFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 实体可以来自任意一个库：一个「场景1」该去场景库挑，「产品2」去产品库。 */
const LIBRARIES = ["models", "products", "scenes"] as const;
type Library = (typeof LIBRARIES)[number];

/**
 * 把请求里的 token 收敛成落盘用的 slug。
 * 认不出的 token 一律拒掉——写进文件名之前必须先证明它是三类实体之一，
 * 否则「../」这种东西就能顺着 token 溜进路径。
 */
function readSlug(token: string): string | null {
  const parsed = parseCastToken(token);
  return parsed ? castTokenSlug(parsed) : null;
}

async function findExisting(projectId: string, slug: string): Promise<{ file: string; extension: string } | null> {
  for (const extension of Object.keys(MIME_BY_EXTENSION)) {
    const file = castEntityPath(projectId, slug, extension);
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
    const token = String(formData.get("token") || "").trim();
    const slug = readSlug(token);
    const assetId = String(formData.get("assetId") || "").trim();
    const rawLibrary = String(formData.get("library") || "").trim();
    const label = String(formData.get("label") || "").trim();
    const file = formData.get("file");

    if (!isSafeSegment(projectId)) return apiBadRequest("项目 id 不合法");
    if (!slug) return apiBadRequest("实体标识不合法，只能是角色/产品/场景加一位序号");

    await mkdir(projectDir(projectId), { recursive: true });

    // 换绑前先清旧的，免得两种扩展名的图同时躺着，取图时撞上老的那张
    const stale = await findExisting(projectId, slug);
    if (stale) await rm(stale.file, { force: true });

    let target = "";
    if (file instanceof File && file.size > 0) {
      const extension = path.extname(file.name).toLowerCase();
      if (!(extension in MIME_BY_EXTENSION)) return apiBadRequest("素材只支持 PNG / JPG / WebP");
      target = castEntityPath(projectId, slug, extension);
      await writeFile(target, Buffer.from(await file.arrayBuffer()));
    } else if (assetId) {
      if (!LIBRARIES.includes(rawLibrary as Library)) return apiBadRequest("素材库不合法");
      // 拷进项目目录再用：库里那条以后被删了，这条片子不该跟着废
      const asset = await readAsset(rawLibrary as Library, assetId);
      if (!asset) return apiBadRequest("这条素材已不在库里，换一条或重新上传");
      target = castEntityPath(projectId, slug, asset.extension);
      await writeFile(target, new Uint8Array(asset.bytes));
    } else {
      return apiBadRequest("选一张素材，或上传一张");
    }

    const ref: CastRef = { assetId, label: label || token, path: target };
    return apiOk({ token, ref }, `已把「${token}」换成你的素材`);
  } catch (error) {
    console.error("[VideoFactory] 绑定对标实体失败", { action: "videoFactory.castEntity.bind", projectId });
    return apiError(error, "videoFactory.castEntity.bind", "绑定素材失败");
  }
}

/** 解绑：图一起删。解绑后这个实体在提示词里回落到对标原本的说法。 */
export async function DELETE(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId") || "";
  const token = params.get("token") || "";
  const slug = readSlug(token);
  try {
    if (!isSafeSegment(projectId)) return apiBadRequest("项目 id 不合法");
    if (!slug) return apiBadRequest("实体标识不合法");

    const existing = await findExisting(projectId, slug);
    if (existing) await rm(existing.file, { force: true });
    return apiOk({ token }, `「${token}」已改回照对标的类型写`);
  } catch (error) {
    return apiError(error, "videoFactory.castEntity.clear", "取消绑定失败");
  }
}

/** 取绑定图的字节，给界面缩略图用；直接回图片，不套信封。 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId") || "";
  const slug = readSlug(params.get("token") || "");
  try {
    if (!isSafeSegment(projectId)) return new NextResponse("项目 id 不合法", { status: 400 });
    if (!slug) return new NextResponse("实体标识不合法", { status: 400 });

    const existing = await findExisting(projectId, slug);
    if (!existing) return new NextResponse("这个实体还没绑素材", { status: 404 });

    const bytes = await readFile(existing.file);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeByExtension(existing.extension),
        // 换绑会覆盖同名文件，不能长缓存
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[VideoFactory] 对标实体素材读取失败", {
      userId: "local",
      action: "videoFactory.castEntity.image",
      projectId,
      token: params.get("token") || "",
      error,
    });
    return new NextResponse("素材读取失败", { status: 500 });
  }
}
