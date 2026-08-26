import { NextRequest, NextResponse } from "next/server";
import { isWorkLocation, readWorkImage } from "@/app/api/image-factory/_works";
import { mimeByExtension } from "@/app/api/image-factory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 取一张作品图。
 * 和素材库取图一样走独立端点：列表多长都不影响开销，浏览器还能按地址缓存。
 * 直接回图片字节，因此不套 { code, data, message } 信封。
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("job") || "";
  const dir = params.get("dir") || "";
  try {
    if (!isWorkLocation(jobId, dir)) return new NextResponse("作品定位参数不合法", { status: 400 });

    const image = await readWorkImage(jobId, dir);
    if (!image) return new NextResponse("作品图不存在", { status: 404 });

    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": mimeByExtension(image.extension),
        // 产物目录一经生成不再改写，删除时地址一起消失，可以放心长缓存
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[ImageFactory] 作品取图失败", {
      userId: "local",
      action: "imageFactory.works.image",
      jobId,
      dir,
      error,
    });
    return new NextResponse("作品图读取失败", { status: 500 });
  }
}
