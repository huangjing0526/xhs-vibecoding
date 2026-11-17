import { NextRequest, NextResponse } from "next/server";
import { apiBadRequest, apiError } from "@/app/api/feishu/_utils";
import { rendererMediaType, rendererServiceHeaders } from "@/lib/integration/renderer";

export const runtime = "nodejs";
const RENDERER_URL = process.env.VIDEO_RENDERER_URL || "http://localhost:8787";

export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const contentType = rendererMediaType(filename);
  if (!contentType) return apiBadRequest("视频文件名无效，请从生成结果重新打开");

  try {
    const headers = new Headers(rendererServiceHeaders());
    const range = request.headers.get("Range");
    if (range) headers.set("Range", range);
    const upstream = await fetch(`${RENDERER_URL}/out/${encodeURIComponent(filename)}`, {
      headers, signal: request.signal, redirect: "error", cache: "no-store",
    });
    const resultHeaders = new Headers();
    for (const key of ["Content-Range", "Accept-Ranges"]) {
      const value = upstream.headers.get(key);
      if (value) resultHeaders.set(key, value);
    }
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return NextResponse.json({ code: upstream.status, data: null, message: upstream.status === 404 ? "视频文件不存在，请检查本地渲染服务" : "视频暂时无法读取，请重新打开" }, { status: upstream.status, headers: resultHeaders });
    }
    resultHeaders.set("Content-Type", contentType);
    resultHeaders.set("X-Content-Type-Options", "nosniff");
    const length = upstream.headers.get("Content-Length");
    if (length) resultHeaders.set("Content-Length", length);
    return new Response(upstream.body, { status: upstream.status, headers: resultHeaders });
  } catch (error) {
    console.error("[RendererProxy] Media unavailable", { userId: "local", tenantId: "local", action: "video.media.proxy", filename, error });
    return apiError(new Error("视频读取失败，请检查本地渲染服务后重试"), "video.media.proxy", "视频读取失败");
  }
}
