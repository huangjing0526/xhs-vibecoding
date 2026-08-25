import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { isSafeSegment, mimeByExtension, modelAssetPath, readModelIndex } from "@/app/api/image-factory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 取一张模特库里的图。
 * 图片走独立端点而不是内联进列表 JSON：库多大都不影响列表开销，浏览器还能按 id 缓存。
 * 这里直接回图片字节，因此不套 { code, data, message } 信封。
 */
export async function GET(request: NextRequest) {
  const modelId = new URL(request.url).searchParams.get("id") || "";
  try {
    if (!isSafeSegment(modelId)) return new NextResponse("模特 id 不合法", { status: 400 });

    const record = (await readModelIndex()).find((item) => item.id === modelId);
    if (!record) return new NextResponse("模特图不存在", { status: 404 });

    const bytes = await readFile(modelAssetPath(record));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeByExtension(record.extension),
        // id 一经生成不再复用，内容不会变，可以放心长缓存
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[ImageFactory] 模特图读取失败", { userId: "local", action: "imageFactory.models.image", modelId, error });
    return new NextResponse("模特图读取失败", { status: 500 });
  }
}
