import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { isSafeSegment } from "@/app/api/video-factory/_shared";
import { readRhythm, writeRhythm } from "@/app/api/video-factory/benchmark/_rhythm";
import { groupIntoStages } from "@/app/api/video-factory/benchmark/_stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface StagesRequest {
  id?: string;
  /** 已经拆过的叙事结构，有就照它分，不另起炉灶 */
  known?: Array<{ stage: string; purpose: string }>;
}

/**
 * 单独跑一次阶段归组。
 *
 * 拆片时会自动跑，这个接口是给两种情况用的：换判据之前拆的老模板要补上，
 * 以及模型上一次分得不好想重来。它只吃口播，所以不必重拆、也不必重看片。
 */
export async function POST(request: NextRequest) {
  let id = "";
  try {
    const body = await readJsonBody<StagesRequest>(request, "videoFactory.benchmark.stages.readJson");
    id = (body.id || "").trim();
    if (!isSafeSegment(id)) return apiBadRequest("节奏 id 不合法");

    const rhythm = await readRhythm(id);
    if (!rhythm) return apiBadRequest("这份节奏模板不在了，重新拆一次");

    const stages = await groupIntoStages(rhythm, body.known);
    if (!stages.length) {
      return apiBadRequest(
        rhythm.shots.some((shot) => shot.voiceover?.text)
          ? "没归成组，再试一次"
          : "这条片子没有口播，分不了段——阶段是按「在说什么事」判的",
      );
    }

    const next = await writeRhythm(id, { ...rhythm, stages });
    return apiOk(
      { rhythm: next },
      `${next.shots.length} 镜归成 ${stages.length} 段：${stages.map((stage) => stage.name).join(" · ")}`,
    );
  } catch (error) {
    console.error("[VideoFactory] 阶段归组失败", { userId: "local", action: "videoFactory.benchmark.stages", id });
    return apiError(error, "videoFactory.benchmark.stages", "阶段归组失败");
  }
}
