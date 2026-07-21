import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../feishu/_utils";
import { generateWorkflowJson } from "@/lib/workflowAi";
import {
  buildInlineRewritePrompt,
  createFallbackInlineRewrite,
  INLINE_REWRITE_LABEL,
  type InlineRewriteAction,
  type InlineRewriteRequest,
  type InlineRewriteResult,
} from "@/lib/inlineRewrite";
import { getDistillationForBlogger } from "@/lib/bloggerWorkflow";

interface InlineRewriteBody extends Omit<InlineRewriteRequest, "selection" | "action"> {
  selection?: string;
  action?: InlineRewriteAction;
  /** 绑定的对标博主，用它的道库约束改写口径 */
  bloggerId?: string;
}

const VALID_ACTIONS: InlineRewriteAction[] = ["polish", "expand", "condense", "hook", "custom"];
/** 选区上限：再长就该整篇改写，不该走内联 */
const MAX_SELECTION = 1200;

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<InlineRewriteBody>(request, "rewrite.inline.readJson");
    const selection = body.selection?.trim();
    const action = body.action;

    if (!selection) {
      return apiBadRequest("请先选中一段文字再改写");
    }
    if (selection.length > MAX_SELECTION) {
      return apiBadRequest(`选中内容超过 ${MAX_SELECTION} 字，请分段改写或用「爆款优化」整篇处理`);
    }
    if (!action || !VALID_ACTIONS.includes(action)) {
      return apiBadRequest("改写动作不合法");
    }
    if (action === "custom" && !body.instruction?.trim()) {
      return apiBadRequest("请填写改写指令");
    }

    const payload: InlineRewriteRequest = {
      selection,
      action,
      instruction: body.instruction?.trim(),
      noteTitle: body.noteTitle,
      painPoint: body.painPoint,
    };
    const distillation = body.bloggerId ? getDistillationForBlogger(body.bloggerId) : null;

    const aiResult = await generateWorkflowJson<InlineRewriteResult>({
      action: "rewrite.inline",
      prompt: buildInlineRewritePrompt(payload, distillation),
      fallback: createFallbackInlineRewrite(payload),
      // 扩写会成倍变长，中文又约 1.5-2 token/字，按选区上限留足余量
      maxTokens: 3000,
    });

    const text = aiResult.result?.text?.trim();
    if (!text) {
      return apiBadRequest("这段没改出结果，换个动作或调整选区再试");
    }

    return apiOk(
      { text, usedFallback: aiResult.usedFallback, provider: aiResult.provider },
      aiResult.usedFallback
        ? "未检测到 AI 配置，已按规则兜底处理"
        : action === "custom"
          ? "已按你的指令改写选中内容"
          : `已${INLINE_REWRITE_LABEL[action]}选中内容`
    );
  } catch (error) {
    return apiError(error, "rewrite.inline", "内联改写失败");
  }
}
