import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../feishu/_utils";
import { generateWorkflowJson } from "@/lib/workflowAi";
import type { BloggerDistillation } from "@/lib/bloggerWorkflow";
import {
  buildRewritePrompt,
  createFallbackRewrite,
  isRewriteIntensity,
  isRewriteTarget,
  normalizeRewriteResult,
  type RewriteInput,
  type RewriteIntensity,
  type RewriteResult,
  type RewriteTarget,
} from "@/lib/rewriteWorkflow";

interface RewriteBody {
  input?: RewriteInput;
  /** 道库由页面直接带来：本机落盘的道库只有页面拿得到，服务端按 bloggerId 查只查得到 demo */
  distillation?: BloggerDistillation | null;
  target?: RewriteTarget;
  intensity?: RewriteIntensity;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<RewriteBody>(request, "rewrite.readJson");
    const input = body.input;
    if (!input?.title?.trim() && !input?.content?.trim()) {
      return apiBadRequest("没有可改写的标题或正文，先生成草稿");
    }
    const target = isRewriteTarget(body.target) ? body.target : "full";
    const intensity = isRewriteIntensity(body.intensity) ? body.intensity : "medium";
    const distillation = body.distillation || null;

    const fallback = createFallbackRewrite(input, distillation, target, intensity);
    const aiResult = await generateWorkflowJson<Partial<RewriteResult>>({
      action: "rewrite.full",
      prompt: buildRewritePrompt(input, distillation, target, intensity),
      fallback,
      maxTokens: 3000,
    });
    const result = aiResult.usedFallback ? fallback : normalizeRewriteResult(aiResult.result, input, fallback);

    // 兜底提示由页面按 usedFallback 出，这里不再写第二份文案
    return apiOk({ result, usedFallback: aiResult.usedFallback }, "改写完成");
  } catch (error) {
    return apiError(error, "rewrite.full", "整篇改写失败");
  }
}
