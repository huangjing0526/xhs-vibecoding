import type { VideoGenJob } from "@/lib/videoGen";

export function rendererServiceHeaders(): Record<string, string> {
  const token = process.env.VIDEO_RENDERER_SERVICE_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const MEDIA_TYPES: Record<string, string> = { mp4: "video/mp4", mp3: "audio/mpeg", webm: "video/webm", wav: "audio/wav", m4a: "audio/mp4" };

export function rendererMediaType(filename: string): string | undefined {
  if (typeof filename !== "string") return undefined;
  const match = /^([a-zA-Z0-9][a-zA-Z0-9_-]*)\.(mp4|mp3|webm|wav|m4a)$/.exec(filename);
  return match ? MEDIA_TYPES[match[2]] : undefined;
}

export function toAppVideoJob(job: VideoGenJob): VideoGenJob {
  if (!job.result) return job;
  if (!rendererMediaType(job.result.fileName)) {
    console.error("[RendererProxy] Invalid media filename", { userId: "local", tenantId: "local", action: "renderer.job.media", jobId: job.id });
    throw new Error("渲染结果文件名无效，请检查本地渲染服务日志");
  }
  return { ...job, result: { ...job.result, videoUrl: `/api/video/media/${encodeURIComponent(job.result.fileName)}` } };
}

// Legacy renderer services return raw objects; app routes always wrap them in the shared API envelope.
export async function readRendererResponse<T>(response: Response): Promise<T> {
  let data: T & { error?: string };
  try {
    data = await response.json();
  } catch (error) {
    console.error("[RendererProxy] Invalid JSON", {
      userId: "local", tenantId: "local", action: "renderer.response.parse", status: response.status, error,
    });
    throw new Error("本地渲染服务返回了非 JSON 响应，请检查服务日志");
  }
  if (!response.ok) {
    const message = data?.error || `渲染服务返回异常（HTTP ${response.status}）`;
    console.error("[RendererProxy] Request failed", {
      userId: "local", tenantId: "local", action: "renderer.response", status: response.status, message,
    });
    throw new Error(message);
  }
  return data;
}
