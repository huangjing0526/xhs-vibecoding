import { NextRequest, NextResponse } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../feishu/_utils";
import { readRendererResponse, rendererServiceHeaders } from "@/lib/integration/renderer";
import type { I2VProvider, VideoGenMode } from "@/lib/videoGen";

// 生视频要调云 API、串行编排、落盘拼接，全在本地渲染服务里做，这里只转发。
export const runtime = "nodejs";

const RENDERER_URL = process.env.VIDEO_RENDERER_URL || "http://localhost:8787";

interface GenerateRequest {
  mode?: VideoGenMode;
  script?: string;
  /** 数字人：一张人物形象图（data URL） */
  image?: string;
  /** 本地合成 / 产品展示：多张图（data URL） */
  images?: string[];
  prompt?: string;
  provider?: I2VProvider;
  voice?: string;
  rate?: string;
  resolution?: string;
  openingSec?: number;
  imageSize?: string;
}

const ENDPOINT: Record<VideoGenMode, string> = {
  local: "/local",
  avatar: "/avatar",
  product: "/product",
};

export async function POST(request: NextRequest) {
  const origin = request.headers.get("Origin");
  const forwardedProtocol = request.headers.get("X-Forwarded-Proto");
  const protocol = forwardedProtocol === "https" || forwardedProtocol === "http" ? `${forwardedProtocol}:` : request.nextUrl.protocol;
  const browserOrigin = `${protocol}//${request.headers.get("Host") || request.nextUrl.host}`;
  let trustedOrigin = false;
  try {
    const url = new URL(browserOrigin);
    const configured = (process.env.VIDEO_WORKBENCH_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
    trustedOrigin = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || configured.includes(url.origin);
  } catch (error) {
    console.error("[api/video/generate] Invalid request origin", { userId: "local", tenantId: "local", action: "video.generate.authorize", error });
  }
  if (!trustedOrigin || (origin && origin !== browserOrigin) || request.headers.get("Sec-Fetch-Site") === "cross-site") {
    console.error("[api/video/generate] Cross-origin request rejected", { userId: "local", tenantId: "local", action: "video.generate.authorize" });
    return NextResponse.json({ code: 403, data: null, message: "请在内容工作台内创建视频任务" }, { status: 403 });
  }
  try {
    const body = await readJsonBody<GenerateRequest>(request, "video.generate.readJson");

    const mode = body.mode;
    if (!mode || !Object.hasOwn(ENDPOINT, mode)) {
      return apiBadRequest("mode 只能是 local（本地合成）、avatar（数字人口播）或 product（产品展示）");
    }
    if (!body.script?.trim()) {
      return apiBadRequest("请先写一段口播脚本");
    }
    if (mode === "avatar" && !body.image) {
      return apiBadRequest("数字人口播需要上传一张人物形象图");
    }
    if (mode !== "avatar" && !body.images?.length) {
      return apiBadRequest(mode === "product" ? "产品展示至少需要上传一张产品图" : "至少需要上传一张图");
    }

    const response = await fetch(`${RENDERER_URL}${ENDPOINT[mode]}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...rendererServiceHeaders() },
      body: JSON.stringify(body),
    });
    const data = await readRendererResponse<{ jobId?: string; error?: string }>(response);
    if (!data?.jobId || typeof data.jobId !== "string") {
      throw new Error(data?.error || "渲染服务没有返回任务 ID，请检查服务版本与日志");
    }

    return apiOk(data, "任务已创建");
  } catch (error) {
    console.error("[api/video/generate] 无法连接本地渲染服务", {
      userId: "local",
      tenantId: "local",
      action: "video.generate.proxy",
      rendererUrl: RENDERER_URL,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(
      new Error(`视频任务创建失败：${error instanceof Error ? error.message : String(error)}。请确认 services/video-renderer 已安装独立依赖并运行 npm start（${RENDERER_URL}）。`),
      "video.generate",
      `无法连接本地视频服务（${RENDERER_URL}）。请确认 services/video-renderer 的独立依赖已就绪并运行 npm start。`
    );
  }
}
