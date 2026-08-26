import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk } from "@/app/api/feishu/_utils";
import { deleteWork, isWorkLocation, listWorks } from "@/app/api/image-factory/_works";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk({ works: await listWorks() }, "作品读取成功");
  } catch (error) {
    return apiError(error, "imageFactory.works.list", "作品读取失败");
  }
}

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
