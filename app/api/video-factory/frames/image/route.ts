import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { MIME_BY_EXTENSION } from "@/app/api/image-factory/_shared";
import { IMAGE_JOB_ROOT } from "@/app/api/video-factory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 取一张候选首帧图的字节。
 * 只放行图片工厂产物目录下的文件，否则这个端点就成了任意文件读取。
 * 这里直接回图片字节，因此不套 { code, data, message } 信封。
 */
export async function GET(request: NextRequest) {
  const raw = new URL(request.url).searchParams.get("path") || "";
  try {
    const resolved = path.resolve(raw);
    if (!resolved.startsWith(`${IMAGE_JOB_ROOT}${path.sep}`)) {
      return new NextResponse("只能读图片工厂的产物", { status: 400 });
    }
    const mime = MIME_BY_EXTENSION[path.extname(resolved).toLowerCase()];
    if (!mime) return new NextResponse("不支持的图片格式", { status: 400 });

    const bytes = await readFile(resolved).catch(() => null);
    if (!bytes) return new NextResponse("图片不存在", { status: 404 });

    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=600" },
    });
  } catch (error) {
    console.error("[VideoFactory] 首帧图读取失败", {
      userId: "local",
      action: "videoFactory.frames.image",
      error,
    });
    return new NextResponse("首帧图读取失败", { status: 500 });
  }
}
