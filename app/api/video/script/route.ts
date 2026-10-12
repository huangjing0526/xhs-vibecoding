import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../feishu/_utils";
import { generateWorkflowJson } from "@/lib/workflowAi";
import type { BloggerDistillation } from "@/lib/bloggerWorkflow";
import {
  buildVideoScriptPrompt,
  createFallbackVideoPlan,
  isVideoDuration,
  isVideoFormat,
  isVideoPace,
  normalizeVideoPlan,
  type VideoPlan,
  type VideoSourceInput,
} from "@/lib/videoWorkflow";

interface VideoScriptBody {
  input?: VideoSourceInput;
  /** 选题绑定的道库，页面直接带来（同整篇改写） */
  distillation?: BloggerDistillation | null;
  format?: unknown;
  duration?: unknown;
  pace?: unknown;
}

/** 笔记 → 视频脚本（口播稿 + 分镜）。没配 AI 时回规则版。 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<VideoScriptBody>(request, "video.script.readJson");
    const input = body.input;
    if (!input?.title?.trim() && !input?.content?.trim()) {
      return apiBadRequest("没有可改成视频的内容，先生成草稿");
    }
    const format = isVideoFormat(body.format) ? body.format : "talking_head";
    const duration = isVideoDuration(body.duration) ? body.duration : "60s";
    const pace = isVideoPace(body.pace) ? body.pace : "steady";
    const distillation = body.distillation || null;

    const fallback = createFallbackVideoPlan(input, distillation, format, duration, pace);
    const aiResult = await generateWorkflowJson<Partial<VideoPlan>>({
      action: "video.script",
      prompt: buildVideoScriptPrompt(input, distillation, format, duration, pace),
      fallback,
      maxTokens: 3000,
    });
    const plan = aiResult.usedFallback ? fallback : normalizeVideoPlan(aiResult.result, fallback);
    return apiOk({ plan, usedFallback: aiResult.usedFallback }, "视频脚本已生成");
  } catch (error) {
    return apiError(error, "video.script", "视频脚本生成失败");
  }
}
