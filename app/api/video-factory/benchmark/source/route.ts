import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { isSafeSegment } from "@/app/api/video-factory/_shared";
import { readRhythm, writeRhythm } from "@/app/api/video-factory/benchmark/_rhythm";
import { clippedShots, type BenchmarkRhythm } from "@/lib/videoFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface SourceRequest {
  id?: string;
  watermarkFree?: boolean;
}

/**
 * 人工确认这条原片干不干净，也就是水印闸门的那一下。
 *
 * 为什么是人来点，不做自动检测：水印检测本身就不可靠，
 * 而一个假阴性的代价是把别人的账号 ID 编进自己的成片里，且编进去就洗不掉。
 * 让人看一眼再点，比让模型猜可靠得多，也就一秒的事。
 *
 * 确认之后立刻切片、撤销之后立刻删片——闸门要落到磁盘上。
 * 只在界面上灰掉按钮的话文件还躺在那儿，下一个读它的人不知道它没过闸。
 */
export async function POST(request: NextRequest) {
  let id = "";
  try {
    const body = await readJsonBody<SourceRequest>(request, "videoFactory.benchmark.source.readJson");
    id = (body.id || "").trim();
    if (!isSafeSegment(id)) return apiBadRequest("节奏 id 不合法");
    if (typeof body.watermarkFree !== "boolean") return apiBadRequest("要说清楚确认还是撤销");

    const rhythm = await readRhythm(id);
    if (!rhythm) return apiBadRequest("这份节奏模板不在了，重新拆一次");

    const next: BenchmarkRhythm = {
      ...rhythm,
      source: {
        origin: rhythm.source?.origin || "upload",
        // 撤销就是把确认时间抹掉：闸门读的是「有没有人确认过」这个事实
        ...(body.watermarkFree ? { confirmedAt: new Date().toISOString() } : {}),
      },
    };
    const synced = await writeRhythm(id, next);

    const clipped = clippedShots(synced).length;
    console.info("[VideoFactory] 水印闸门已更新", {
      userId: "local",
      action: "videoFactory.benchmark.source",
      id,
      watermarkFree: body.watermarkFree,
      clipped,
    });
    return apiOk(
      { rhythm: synced },
      body.watermarkFree
        ? clipped
          ? `已确认无水印，切出 ${clipped} 段原片可拿去编辑`
          : "已确认无水印，但当前没有镜头需要走编辑通道"
        : "已撤销确认，原片段全部删掉了",
    );
  } catch (error) {
    console.error("[VideoFactory] 水印闸门更新失败", { userId: "local", action: "videoFactory.benchmark.source", id });
    return apiError(error, "videoFactory.benchmark.source", "水印确认失败");
  }
}
