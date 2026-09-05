import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { isSafeSegment } from "@/app/api/video-factory/_shared";
import { readRhythm } from "@/app/api/video-factory/benchmark/_rhythm";
import { runScreening } from "@/app/api/video-factory/benchmark/_screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 路线走全量、分批送，30 多镜的片子是四五次调用串着跑，300 秒不够
export const maxDuration = 1200;

interface ScreenRequest {
  id?: string;
}

/**
 * 手动重看一次。
 * 拆片时已经自动看过一遍，这个接口是给「换了灵敏度重拆」和「上一次模型抽风」用的。
 */
export async function POST(request: NextRequest) {
  let id = "";
  try {
    const body = await readJsonBody<ScreenRequest>(request, "videoFactory.screen.readJson");
    id = (body.id || "").trim();
    if (!isSafeSegment(id)) return apiBadRequest("节奏 id 不合法");

    const rhythm = await readRhythm(id);
    if (!rhythm) return apiBadRequest("这份节奏模板不在了，重新拆一次");

    const outcome = await runScreening(id, rhythm);
    // 一张帧都没读到才是「重新拆一次」能解决的问题。
    // 帧齐全但模型回了空，重跑 ffmpeg 没有用，那种情况由下面的两个数字如实说出来
    if (!outcome.frames) return apiBadRequest("这份节奏没有关键帧，重新拆一次再看片");

    const total = outcome.rhythm.shots.length;
    const routed = outcome.rhythm.report?.shots.length ?? 0;
    const described = outcome.rhythm.shots.filter((shot) => shot.content).length;
    return apiOk(
      { rhythm: outcome.rhythm, usedFallback: outcome.usedFallback, provider: outcome.provider },
      outcome.usedFallback
        ? "未配置 AI，看不了画面"
        // 两个数分开报：路线走全量、画面描述守抽样上限，本来就不该一样
        : `${total} 镜里判了 ${routed} 镜的路线，${described} 镜有画面描述`,
    );
  } catch (error) {
    console.error("[VideoFactory] 看片失败", { action: "videoFactory.replicability", id });
    return apiError(error, "videoFactory.replicability", "看片失败");
  }
}
