import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { findFramePath, isSafeSegment, setFrameApproval } from "@/app/api/video-factory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 确认（或撤销）一镜的首帧。
 * 视频模型只认首帧：人和货在首帧里偏了，后面每一帧都跟着偏，所以出片前要人看一眼。
 */
export async function POST(request: NextRequest) {
  let projectId = "";
  let shotOrder = 0;
  try {
    const body = await readJsonBody<{ projectId?: string; shotOrder?: number; approved?: boolean }>(
      request,
      "videoFactory.frameReview.readJson",
    );
    projectId = String(body.projectId || "").trim();
    shotOrder = Number(body.shotOrder || 0);
    const approved = body.approved !== false;

    if (!isSafeSegment(projectId)) return apiBadRequest("项目 id 不合法");
    if (!Number.isInteger(shotOrder) || shotOrder < 1 || shotOrder > 99) return apiBadRequest("镜号不合法");
    if (approved && !(await findFramePath(projectId, shotOrder))) return apiBadRequest(`第 ${shotOrder} 镜还没有首帧`);

    const approvedFrames = await setFrameApproval(projectId, shotOrder, approved);
    return apiOk({ approvedFrames }, approved ? `第 ${shotOrder} 镜首帧已确认` : `已撤销第 ${shotOrder} 镜首帧确认`);
  } catch (error) {
    console.error("[VideoFactory] 首帧确认失败", { userId: "local", action: "videoFactory.frameReview", projectId, shotOrder });
    return apiError(error, "videoFactory.frameReview", "首帧确认失败");
  }
}
