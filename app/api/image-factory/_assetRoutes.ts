import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import {
  deleteAsset,
  listAssets,
  readAsset,
  saveAssets,
  uploadAssets,
  type SaveAssetItem,
  type UploadAssetItem,
} from "@/app/api/image-factory/_assets";
import { ASSET_LABEL, isSafeSegment, mimeByExtension, type AssetKind } from "@/app/api/image-factory/_shared";

/**
 * 素材库路由的共用实现。
 * 模特库、产品库、场景库是同一套 CRUD，各自的 route.ts 只负责说明自己是哪一种，
 * 返回体里的键名（models / products / scenes）也由这里按 kind 决定。
 */

/** 单张上传图的标注：优先用文件名，取不到才退回请求里那个共用标注。 */
function uploadLabel(fileName: string, shared: string): string {
  const base = path.basename(fileName, path.extname(fileName)).trim().slice(0, 40);
  return base || shared || "未标注";
}

export function createAssetHandlers(kind: AssetKind) {
  const label = ASSET_LABEL[kind];

  return {
    async GET() {
      try {
        return apiOk({ [kind]: await listAssets(kind) }, `${label}读取成功`);
      } catch (error) {
        return apiError(error, `imageFactory.${kind}.list`, `${label}读取失败`);
      }
    },

    /**
     * 入库有两条路：生成产物按路径入库（JSON），手上已有的图直接传字节（multipart）。
     * 场景和商品参考图多半是自己拍的，只留生成那一条路的话，库就只能靠跑一遍生成来填。
     */
    async POST(request: NextRequest) {
      if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
        try {
          const formData = await request.formData();
          const name = String(formData.get("name") || "").trim();
          const sharedLabel = String(formData.get("sourceLabel") || "").trim();
          const traits = String(formData.get("traits") || "").trim();
          const files = formData.getAll("files").filter((file): file is File => file instanceof File && file.size > 0);

          if (!name) return apiBadRequest(`请填写名称后再存入${label}`);
          if (files.length === 0) return apiBadRequest("请选择要上传的图片");

          const items: UploadAssetItem[] = await Promise.all(
            files.map(async (file) => ({
              bytes: Buffer.from(await file.arrayBuffer()),
              fileName: file.name,
              name,
              // 只传一张时听人手填的那个标注，多张时各自用文件名，否则整批标注全一样，进了库分不出谁是谁
              sourceLabel: files.length === 1 && sharedLabel ? sharedLabel : uploadLabel(file.name, sharedLabel),
              traits,
            })),
          );

          const added = await uploadAssets(kind, items);
          return apiOk({ [kind]: added }, `已存入${label} ${added.length} 张`);
        } catch (error) {
          return apiError(error, `imageFactory.${kind}.upload`, `上传到${label}失败`);
        }
      }

      try {
        const body = await readJsonBody<{ items?: SaveAssetItem[] }>(request, `imageFactory.${kind}.save`);
        const items = (body.items || [])
          .map((item) => ({
            sourcePath: String(item?.sourcePath || "").trim(),
            name: String(item?.name || "").trim(),
            sourceLabel: String(item?.sourceLabel || "").trim(),
            traits: String(item?.traits || "").trim(),
          }))
          .filter((item) => item.sourcePath && item.name);
        if (items.length === 0) return apiBadRequest(`请填写名称后再存入${label}`);

        const added = await saveAssets(kind, items);
        return apiOk({ [kind]: added }, `已存入${label} ${added.length} 张`);
      } catch (error) {
        return apiError(error, `imageFactory.${kind}.save`, `存入${label}失败`);
      }
    },

    async DELETE(request: NextRequest) {
      const assetId = new URL(request.url).searchParams.get("id") || "";
      try {
        if (!isSafeSegment(assetId)) return apiBadRequest("素材 id 不合法");
        if (!(await deleteAsset(kind, assetId))) return apiBadRequest(`这条素材已不在${label}里`);
        return apiOk({ id: assetId }, `已从${label}移除`);
      } catch (error) {
        return apiError(error, `imageFactory.${kind}.delete`, `从${label}移除失败`);
      }
    },

    /**
     * 取一张素材图。
     * 图片走独立端点而不是内联进列表 JSON：库多大都不影响列表开销，浏览器还能按 id 缓存。
     * 这里直接回图片字节，因此不套 { code, data, message } 信封。
     */
    async IMAGE(request: NextRequest) {
      const assetId = new URL(request.url).searchParams.get("id") || "";
      try {
        if (!isSafeSegment(assetId)) return new NextResponse("素材 id 不合法", { status: 400 });

        const asset = await readAsset(kind, assetId);
        if (!asset) return new NextResponse("素材图不存在", { status: 404 });

        return new NextResponse(new Uint8Array(asset.bytes), {
          headers: {
            "Content-Type": mimeByExtension(asset.extension),
            // id 一经生成不再复用，内容不会变，可以放心长缓存
            "Cache-Control": "private, max-age=31536000, immutable",
          },
        });
      } catch (error) {
        console.error(`[ImageFactory] ${label}取图失败`, {
          userId: "local",
          action: `imageFactory.${kind}.image`,
          assetId,
          error,
        });
        return new NextResponse("素材图读取失败", { status: 500 });
      }
    },
  };
}
