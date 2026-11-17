import { NextRequest } from "next/server";
import type { VideoGenJob } from "@/lib/videoGen";
import { readRendererResponse, rendererServiceHeaders, toAppVideoJob } from "@/lib/integration/renderer";
import { apiError, apiOk } from "../../../feishu/_utils";

// 任务状态存在本地渲染服务的内存里，这里只转发。
export const runtime = "nodejs";

const RENDERER_URL = process.env.VIDEO_RENDERER_URL || "http://localhost:8787";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const response = await fetch(`${RENDERER_URL}/jobs/${encodeURIComponent(id)}`, { headers: rendererServiceHeaders(), signal: _request.signal });
    const data = await readRendererResponse<VideoGenJob>(response);
    if (!data?.id || !["running", "done", "error"].includes(data.state)) {
      throw new Error(data?.error || "渲染服务没有返回有效任务状态，请检查服务版本与日志");
    }

    return apiOk(toAppVideoJob(data), "任务状态");
  } catch (error) {
    console.error("[api/video/jobs] 无法连接本地渲染服务", {
      userId: "local",
      tenantId: "local",
      action: "video.job.proxy",
      rendererUrl: RENDERER_URL,
      jobId: id,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(new Error(`任务状态查询失败：${error instanceof Error ? error.message : String(error)}。请检查 services/video-renderer；服务重启后内存任务需要重新提交。`), "video.job.query", `无法连接本地视频服务（${RENDERER_URL}）`);
  }
}
