import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { generateWorkflowJson } from "@/lib/workflowAi";
import {
  buildScriptRewritePrompt,
  createFallbackScriptDraft,
  normalizeScriptDraft,
  EMPTY_TOPIC_INPUT,
  type BenchmarkSkeleton,
  type ScriptDraft,
  type TopicInput,
} from "@/lib/videoFactory";

export const runtime = "nodejs";

interface ScriptRequest {
  skeleton?: BenchmarkSkeleton | null;
  topic?: TopicInput;
  targetDurationSec?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<ScriptRequest>(request, "videoFactory.script.readJson");
    const topic = { ...EMPTY_TOPIC_INPUT, ...(body.topic || {}) };
    if (!topic.topic.trim() && !topic.sellingPoints.trim()) {
      return apiBadRequest("先填一下这条视频要讲什么，或者列几条卖点");
    }

    const skeleton = body.skeleton || null;
    // 目标时长限制在 15~180 秒：短于 15 秒切不出分镜，长于 180 秒不该走单条 AI 生成
    const targetDurationSec = Math.min(180, Math.max(15, Math.round(body.targetDurationSec || 45)));

    const fallback = createFallbackScriptDraft(skeleton, topic);
    const ai = await generateWorkflowJson<ScriptDraft>({
      action: "videoFactory.script",
      prompt: buildScriptRewritePrompt({ skeleton, topic, targetDurationSec }),
      fallback,
      maxTokens: 2600,
    });
    const script = normalizeScriptDraft(ai.result, fallback);

    return apiOk(
      { script, usedFallback: ai.usedFallback, provider: ai.provider },
      ai.usedFallback ? "未配置 AI，已铺好结构空位，口播稿请手写" : "已按对标结构写出新脚本"
    );
  } catch (error) {
    return apiError(error, "videoFactory.script", "脚本改写失败");
  }
}
