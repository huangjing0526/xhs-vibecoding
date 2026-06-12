import { NextResponse, type NextRequest } from "next/server";

// 渲染依赖本地 Node 渲染服务（Remotion + edge-tts），必须用 nodejs runtime 转发。
export const runtime = "nodejs";

const RENDERER_URL = process.env.VIDEO_RENDERER_URL || "http://localhost:8787";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  try {
    const resp = await fetch(`${RENDERER_URL}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({ error: "渲染服务返回了非 JSON 响应" }));
    return NextResponse.json(data, { status: resp.status });
  } catch (error) {
    console.error("[api/video/render] 无法连接本地渲染服务", {
      action: "video.render.proxy",
      rendererUrl: RENDERER_URL,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: `无法连接本地视频渲染服务（${RENDERER_URL}）。请先在 services/video-renderer 目录运行 npm install && npm start。`,
      },
      { status: 502 }
    );
  }
}
