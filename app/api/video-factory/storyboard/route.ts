import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { generateWorkflowJson } from "@/lib/workflowAi";
import {
  buildStoryboardPrompt,
  createFallbackStoryboard,
  normalizeStoryboard,
  type BenchmarkRhythm,
  type ScriptDraft,
  type Storyboard,
} from "@/lib/videoFactory";

export const runtime = "nodejs";

interface StoryboardRequest {
  script?: ScriptDraft;
  visualStyle?: string;
  /** 套用的对标节奏模板，有就按它的镜头数与时长切 */
  rhythm?: BenchmarkRhythm | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<StoryboardRequest>(request, "videoFactory.storyboard.readJson");
    const script = body.script;
    if (!script || !Array.isArray(script.segments) || !script.segments.length) {
      return apiBadRequest("先出一版脚本再拆分镜");
    }

    const fallback = createFallbackStoryboard(script);
    const ai = await generateWorkflowJson<Storyboard>({
      action: "videoFactory.storyboard",
      prompt: buildStoryboardPrompt(script, { visualStyle: body.visualStyle, rhythm: body.rhythm }),
      fallback,
      maxTokens: 4000,
    });
    const storyboard = normalizeStoryboard(ai.result, fallback);

    return apiOk(
      { storyboard, usedFallback: ai.usedFallback, provider: ai.provider },
      ai.usedFallback
        ? "未配置 AI，已按脚本分段一段一镜，提示词请手动补"
        : body.rhythm
          ? `已按对标节奏拆成 ${storyboard.shots.length} 个镜头`
          : `已拆成 ${storyboard.shots.length} 个镜头`
    );
  } catch (error) {
    return apiError(error, "videoFactory.storyboard", "分镜拆解失败");
  }
}
