import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { generateWorkflowJson } from "@/lib/workflowAi";
import {
  buildStoryboardPrompt,
  createFallbackStoryboard,
  normalizeStoryboard,
  replanRhythm,
  VIDEO_GEN_PROVIDERS,
  type BenchmarkRhythm,
  type CastBinding,
  type ScriptDraft,
  type Storyboard,
  type VideoGenProviderId,
} from "@/lib/videoFactory";

export const runtime = "nodejs";

interface StoryboardRequest {
  script?: ScriptDraft;
  visualStyle?: string;
  /** 套用的对标节奏模板，有就按它的镜头数与时长切 */
  rhythm?: BenchmarkRhythm | null;
  /** 项目选定的出片引擎，决定每镜能切成几秒 */
  genProvider?: VideoGenProviderId;
  /** 对标实体 → 自己的素材。提示词里的主体在服务端就换好，不劳模型判断哪部分该换 */
  castBinding?: CastBinding;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<StoryboardRequest>(request, "videoFactory.storyboard.readJson");
    const script = body.script;
    if (!script || !Array.isArray(script.segments) || !script.segments.length) {
      return apiBadRequest("先出一版脚本再拆分镜");
    }

    const genProvider: VideoGenProviderId = VIDEO_GEN_PROVIDERS.includes(body.genProvider as VideoGenProviderId)
      ? (body.genProvider as VideoGenProviderId)
      : "grok-cli";

    // 节奏模板里的 plan 是切镜时按别的引擎算的，套进这个项目前先按本项目的引擎重算，
    // 否则提示词里会写着「这一镜生成 10 秒」而该引擎最长只有 8 秒
    const rhythm = body.rhythm ? replanRhythm(body.rhythm, genProvider) : null;

    const fallback = createFallbackStoryboard(script, genProvider);
    const ai = await generateWorkflowJson<Storyboard>({
      action: "videoFactory.storyboard",
      prompt: buildStoryboardPrompt(script, {
        visualStyle: body.visualStyle,
        rhythm,
        castBinding: body.castBinding,
      }),
      fallback,
      maxTokens: 4000,
    });
    const storyboard = normalizeStoryboard(ai.result, fallback, genProvider, rhythm);

    return apiOk(
      { storyboard, usedFallback: ai.usedFallback, provider: ai.provider },
      ai.usedFallback
        ? "未配置 AI，已按脚本分段一段一镜，提示词请手动补"
        : rhythm
          ? `已按对标节奏拆成 ${storyboard.shots.length} 个镜头`
          : `已拆成 ${storyboard.shots.length} 个镜头`
    );
  } catch (error) {
    return apiError(error, "videoFactory.storyboard", "分镜拆解失败");
  }
}
