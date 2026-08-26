import { readFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { apiBadRequest, apiError, apiOk } from "@/app/api/feishu/_utils";
import { clipPath, framePath, isSafeSegment, projectDir } from "@/app/api/video-factory/_shared";
import { snapShotDuration, type ShotClip } from "@/lib/videoFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 首帧图可能的扩展名，与生成接口放行的那组保持一致。 */
const FRAME_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

/**
 * 取某一镜的成片。
 * 视频走独立端点而不是内联进项目 JSON：片子几十兆，塞进 JSON 会把整页拖垮。
 * 这里直接回视频字节，因此不套 { code, data, message } 信封。
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId") || "";
  const shotOrder = Number(params.get("shot") || 0);
  try {
    if (!isSafeSegment(projectId)) return new NextResponse("项目 id 不合法", { status: 400 });
    if (!Number.isInteger(shotOrder) || shotOrder < 1 || shotOrder > 99) {
      return new NextResponse("镜号不合法", { status: 400 });
    }

    const file = clipPath(projectId, shotOrder);
    const bytes = await readFile(file).catch(() => null);
    if (!bytes) return new NextResponse("这一镜还没有成片", { status: 404 });

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "video/mp4",
        // 同一镜重跑会覆盖同名文件，不能长缓存
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[VideoFactory] 成片读取失败", {
      userId: "local",
      action: "videoFactory.clip.read",
      projectId,
      shotOrder,
      error,
    });
    return new NextResponse("成片读取失败", { status: 500 });
  }
}

/** 手动通道：在即梦/可灵生成好的 mp4 传回来，挂到对应镜头上。 */
export async function POST(request: NextRequest) {
  let projectId = "";
  let shotOrder = 0;
  try {
    const formData = await request.formData();
    projectId = String(formData.get("projectId") || "").trim();
    shotOrder = Number(formData.get("shotOrder") || 0);
    const durationSec = snapShotDuration(formData.get("durationSec"));

    if (!isSafeSegment(projectId)) return apiBadRequest("项目 id 不合法");
    if (!Number.isInteger(shotOrder) || shotOrder < 1 || shotOrder > 99) return apiBadRequest("镜号不合法");

    const file = formData.get("clipFile");
    if (!(file instanceof File) || file.size === 0) return apiBadRequest("请选择一个 mp4 文件");
    if (path.extname(file.name).toLowerCase() !== ".mp4") return apiBadRequest("只支持 mp4");

    const dir = projectDir(projectId);
    await mkdir(dir, { recursive: true });
    const target = clipPath(projectId, shotOrder);
    await writeFile(target, Buffer.from(await file.arrayBuffer()));

    // 手动通道没有首帧图这一步；之前选过就带上，扩展名逐个试，别硬猜 .png
    let existingFrame = "";
    for (const extension of FRAME_EXTENSIONS) {
      const candidate = framePath(projectId, shotOrder, extension);
      if (await stat(candidate).then((info) => info.isFile(), () => false)) {
        existingFrame = candidate;
        break;
      }
    }

    const clip: ShotClip = {
      shotOrder,
      provider: "manual",
      videoPath: target,
      durationSec,
      // 分辨率是平台那边定的，我们量不出来，留空好过编一个
      createdAt: new Date().toISOString(),
      framePath: existingFrame,
    };

    return apiOk({ projectId, shotOrder, clip }, `第 ${shotOrder} 镜已挂上`);
  } catch (error) {
    console.error("[VideoFactory] 成片上传失败", { action: "videoFactory.clip.upload", projectId, shotOrder });
    return apiError(error, "videoFactory.clip.upload", "成片上传失败");
  }
}
