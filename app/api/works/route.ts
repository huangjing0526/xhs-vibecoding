import { apiError, apiOk } from "@/app/api/feishu/_utils";
import { listWorks } from "@/app/api/image-factory/_works";
import { listVideoWorks } from "@/app/api/video-factory/_works";
import { byCreatedAtDesc } from "@/lib/collections";
import type { AnyWork } from "@/lib/works";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 全部作品：图片工厂的图 + 视频工厂各项目的成片，按生成时间倒序。
 * 这里只合并、排序——怎么存、怎么投影成作品由各工厂自己的 _works 模块管；
 * 删除也归各自的地方（图片走 /api/image-factory/works 的 DELETE，成片归项目所有，动它去视频工厂）。
 */
export async function GET() {
  try {
    const [images, videos] = await Promise.all([listWorks(), listVideoWorks()]);
    const works: AnyWork[] = [
      ...images.map((image) => ({ ...image, kind: "image" as const })),
      ...videos,
    ].sort(byCreatedAtDesc);
    return apiOk({ works }, "作品读取成功");
  } catch (error) {
    return apiError(error, "works.list", "作品读取失败");
  }
}
