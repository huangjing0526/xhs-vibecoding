import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { benchmarkDir, isSafeSegment } from "@/app/api/video-factory/_shared";
import { runScreening } from "@/app/api/video-factory/benchmark/_screen";
import type { BenchmarkRhythm } from "@/lib/videoFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

    const rhythmFile = path.join(benchmarkDir(id), "rhythm.json");
    const raw = await readFile(rhythmFile, "utf8").catch(() => null);
    if (!raw) return apiBadRequest("这份节奏模板不在了，重新拆一次");

    const outcome = await runScreening(id, JSON.parse(raw) as BenchmarkRhythm);
    if (!outcome.frames) return apiBadRequest("这份节奏没有关键帧，重新拆一次再看片");

    const described = outcome.rhythm.shots.filter((shot) => shot.content).length;
    return apiOk(
      { rhythm: outcome.rhythm, usedFallback: outcome.usedFallback, provider: outcome.provider },
      outcome.usedFallback
        ? "未配置 AI，看不了画面"
        : `看了 ${outcome.frames} 帧，${described} 镜有画面描述`,
    );
  } catch (error) {
    console.error("[VideoFactory] 看片失败", { action: "videoFactory.replicability", id });
    return apiError(error, "videoFactory.replicability", "看片失败");
  }
}
