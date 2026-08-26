import { createWriteStream } from "node:fs";
import { readFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { NextRequest, NextResponse } from "next/server";
import { apiBadRequest, apiError, apiOk } from "@/app/api/feishu/_utils";
import { clipPath, framePath, isSafeSegment, projectDir, readProject, writeProject } from "@/app/api/video-factory/_shared";
import { isUploadProvider, snapShotDuration, type ShotClip } from "@/lib/videoFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 首帧图可能的扩展名，与生成接口放行的那组保持一致。 */
const FRAME_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

/** 回传片子的时长上限（秒）。超出的多半是传错了文件，不该当成一镜挂上去。 */
const MAX_CLIP_DURATION_SEC = 600;

/**
 * 回传片子的实际时长。
 * 这里记的是「这条片子有多长」，不是「要向 grok 请求几秒」——后者才归 SHOT_DURATIONS 的 6/10 档管。
 * 所以据实记录：网页端送的本来就是 6/10，原样通过；豆包送的是任意秒数，也原样留住。
 * 只有读不出有效值时才回落到 snapShotDuration，免得写进一个 NaN。
 */
function resolveDuration(raw: unknown): number {
  const seconds = Number(raw);
  if (!(seconds > 0) || seconds > MAX_CLIP_DURATION_SEC) return snapShotDuration(raw);
  return Math.round(seconds * 10) / 10;
}

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

/**
 * 把这一镜写进 project.json 的 clips。
 * 网页端会自己把返回的 clip 并进 state 再存一次，两边写的是同一条，结果一致；
 * 但扩展那条路没有前端接盘，不在这里落就只有 mp4 躺在盘上、项目却不认它。
 */
async function mergeClipIntoProject(projectId: string, clip: ShotClip): Promise<void> {
  const project = await readProject(projectId);
  if (!project) {
    // 片子字节已经落盘了，这里再失败也追不回来，留痕即可，别把整次回传判死
    console.error("[VideoFactory] 成片已落盘但项目读不到，clips 未更新", {
      userId: "local",
      action: "videoFactory.clip.merge",
      projectId,
      shotOrder: clip.shotOrder,
    });
    return;
  }

  const clips = [...project.clips.filter((existing) => existing.shotOrder !== clip.shotOrder), clip].sort(
    (a, b) => a.shotOrder - b.shotOrder,
  );
  await writeProject({ ...project, clips });
}

/**
 * 回传通道：片子在别处生成好，把 mp4 传回来挂到对应镜头上。
 * manual = 人工去即梦/可灵跑完手动上传；doubao = 豆包下载器从网页端抓到无水印片直接推过来。
 */
export async function POST(request: NextRequest) {
  let projectId = "";
  let shotOrder = 0;
  try {
    const formData = await request.formData();
    projectId = String(formData.get("projectId") || "").trim();
    shotOrder = Number(formData.get("shotOrder") || 0);
    // 不带 provider 的老调用（网页端的手动上传表单）继续按 manual 走，保持向后兼容
    const provider = String(formData.get("provider") || "").trim() || "manual";
    const durationSec = resolveDuration(formData.get("durationSec"));

    if (!isSafeSegment(projectId)) return apiBadRequest("项目 id 不合法");
    if (!Number.isInteger(shotOrder) || shotOrder < 1 || shotOrder > 99) return apiBadRequest("镜号不合法");
    if (!isUploadProvider(provider)) return apiBadRequest("回传通道不合法");

    const file = formData.get("clipFile");
    if (!(file instanceof File) || file.size === 0) return apiBadRequest("请选择一个 mp4 文件");
    if (path.extname(file.name).toLowerCase() !== ".mp4") return apiBadRequest("只支持 mp4");

    const dir = projectDir(projectId);
    await mkdir(dir, { recursive: true });
    const target = clipPath(projectId, shotOrder);
    // 几十兆的片子别走 arrayBuffer + Buffer.from——那是在 formData 已经缓冲之外再复制两份
    await pipeline(Readable.fromWeb(file.stream() as NodeWebReadableStream), createWriteStream(target));

    // 回传通道没有首帧图这一步；之前选过就带上，扩展名逐个试，别硬猜 .png
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
      provider,
      videoPath: target,
      durationSec,
      // 分辨率是平台那边定的，我们量不出来，留空好过编一个
      createdAt: new Date().toISOString(),
      framePath: existingFrame,
    };

    await mergeClipIntoProject(projectId, clip);

    return apiOk({ projectId, shotOrder, clip }, `第 ${shotOrder} 镜已挂上`);
  } catch (error) {
    console.error("[VideoFactory] 成片上传失败", { action: "videoFactory.clip.upload", projectId, shotOrder });
    return apiError(error, "videoFactory.clip.upload", "成片上传失败");
  }
}
