import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { benchmarkDir, isSafeSegment } from "@/app/api/video-factory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 取某一镜的关键帧。
 * 走独立端点而不是内联进节奏 JSON：几十张缩略图塞进 JSON 会让整份模板变得没法看。
 * 这里直接回图片字节，因此不套 { code, data, message } 信封。
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") || "";
  const shot = Number(params.get("shot") || 0);
  try {
    if (!isSafeSegment(id)) return new NextResponse("节奏 id 不合法", { status: 400 });
    if (!Number.isInteger(shot) || shot < 1 || shot > 999) return new NextResponse("镜号不合法", { status: 400 });

    const file = path.join(benchmarkDir(id), `frame-${String(shot).padStart(2, "0")}.jpg`);
    const bytes = await readFile(file).catch(() => null);
    if (!bytes) return new NextResponse("这一镜没有关键帧", { status: 404 });

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        // 重测灵敏度会覆盖同名文件，不能长缓存
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[VideoFactory] 关键帧读取失败", {
      userId: "local",
      action: "videoFactory.benchmark.frame",
      id,
      shot,
      error,
    });
    return new NextResponse("关键帧读取失败", { status: 500 });
  }
}
