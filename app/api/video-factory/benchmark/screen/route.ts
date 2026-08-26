import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { benchmarkDir, isSafeSegment } from "@/app/api/video-factory/_shared";
import { generateWorkflowJson, type WorkflowImage } from "@/lib/workflowAi";
import {
  buildReplicabilityPrompt,
  createFallbackReport,
  normalizeReport,
  pickFramesToScreen,
  type BenchmarkRhythm,
} from "@/lib/videoFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ScreenRequest {
  id?: string;
}

export async function POST(request: NextRequest) {
  let id = "";
  try {
    const body = await readJsonBody<ScreenRequest>(request, "videoFactory.screen.readJson");
    id = (body.id || "").trim();
    if (!isSafeSegment(id)) return apiBadRequest("节奏 id 不合法");

    const dir = benchmarkDir(id);
    const rhythmFile = path.join(dir, "rhythm.json");
    const raw = await readFile(rhythmFile, "utf8").catch(() => null);
    if (!raw) return apiBadRequest("这份节奏模板不在了，重新拆一次");
    const rhythm = JSON.parse(raw) as BenchmarkRhythm;

    // 帧多了只是重复信息，均匀抽样，首尾必留
    const picked = pickFramesToScreen(rhythm.shots);
    const images: WorkflowImage[] = [];
    for (const shot of picked) {
      const file = path.join(dir, `frame-${String(shot.order).padStart(2, "0")}.jpg`);
      const bytes = await readFile(file).catch(() => null);
      if (bytes) images.push({ mimeType: "image/jpeg", base64: bytes.toString("base64") });
    }
    if (!images.length) return apiBadRequest("这份节奏没有关键帧，重新拆一次再筛查");

    // 送去的帧和 prompt 里的编号必须一一对应，所以按真正读到的那些帧重建清单
    const screened = picked.slice(0, images.length);
    const fallback = createFallbackReport();
    const ai = await generateWorkflowJson<Parameters<typeof normalizeReport>[0]>({
      action: "videoFactory.replicability",
      prompt: buildReplicabilityPrompt(screened),
      fallback,
      images,
      maxTokens: 3000,
    });
    const report = normalizeReport(ai.result, fallback, screened);

    const next: BenchmarkRhythm = { ...rhythm, report };
    await writeFile(rhythmFile, JSON.stringify(next, null, 2), "utf8");

    console.info("[VideoFactory] 可复刻性筛查完成", {
      action: "videoFactory.replicability",
      id,
      frames: images.length,
      verdict: report.verdict,
    });
    return apiOk(
      { rhythm: next, usedFallback: ai.usedFallback, provider: ai.provider },
      ai.usedFallback ? "未配置 AI，看不了画面" : `看了 ${images.length} 帧，结论已出`,
    );
  } catch (error) {
    console.error("[VideoFactory] 可复刻性筛查失败", { action: "videoFactory.replicability", id });
    return apiError(error, "videoFactory.replicability", "可复刻性筛查失败");
  }
}
