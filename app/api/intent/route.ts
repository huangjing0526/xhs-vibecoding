import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../feishu/_utils";
import { generateWorkflowJson } from "@/lib/workflowAi";
import { AREAS } from "@/lib/capabilities";
import {
  buildIntentPrompt,
  normalizeIntent,
  routeByKeyword,
  type IntentResult,
} from "@/lib/intentRouting";

interface IntentBody {
  text?: string;
}

/** 一句话的长度上限：再长就不是「我要做什么」，而是内容本身，该去对应工具里填。 */
const MAX_TEXT = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<IntentBody>(request, "intent.readJson");
    const text = body.text?.trim();

    if (!text) {
      return apiBadRequest("说一句你想做什么，比如「给这篇笔记做封面」");
    }
    if (text.length > MAX_TEXT) {
      return apiBadRequest(`描述超过 ${MAX_TEXT} 字，说清要做什么就行，细节到工具里再填`);
    }

    const aiResult = await generateWorkflowJson<IntentResult>({
      action: "intent.route",
      prompt: buildIntentPrompt(text),
      fallback: routeByKeyword(text),
      // 只回一个 id 加一句话，给足余量也用不到多少
      maxTokens: 200,
    });

    const intent = normalizeIntent(aiResult.result, text);

    return apiOk(
      { ...intent, usedFallback: aiResult.usedFallback, provider: aiResult.provider },
      `${intent.reason}，已打开「${AREAS[intent.area].label}」`
    );
  } catch (error) {
    return apiError(error, "intent.route", "没看懂这句话要做什么");
  }
}
