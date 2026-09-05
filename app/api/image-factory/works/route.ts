import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk } from "@/app/api/feishu/_utils";
import { deleteWork, isWorkLocation } from "@/app/api/image-factory/_works";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 列表已由 /api/works 聚合端点统一提供（图片 + 视频），这里只留删除——
// 删除按存储归属就近：图片作品的产物目录归图片工厂管。
export async function DELETE(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("job") || "";
  const dir = params.get("dir") || "";
  try {
    if (!isWorkLocation(jobId, dir)) return apiBadRequest("作品定位参数不合法");
    if (!(await deleteWork(jobId, dir))) return apiBadRequest("这件作品已经不在本机了");
    return apiOk({ jobId, dir }, "已删除这件作品");
  } catch (error) {
    console.error("[ImageFactory] 作品删除失败", {
      userId: "local",
      action: "imageFactory.works.delete",
      jobId,
      dir,
      error,
    });
    return apiError(error, "imageFactory.works.delete", "作品删除失败");
  }
}
