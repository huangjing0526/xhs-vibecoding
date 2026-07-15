import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../_utils";
import { generateWorkflowJson } from "@/lib/workflowAi";
import { DEFAULT_TARGET_ID, assetAspect } from "@/lib/targets";
import {
  buildContentImagePrompt,
  createFallbackContentImagePlan,
  normalizeContentImagePlan,
  type ContentImagePlan,
  type ContentImageTemplateType,
  type ImageAssetKind,
  type ImageWorkflowSourceInput,
} from "@/lib/imageWorkflow";

interface ImagesRequest {
  kind?: ImageAssetKind;
  input?: ImageWorkflowSourceInput;
  templateType?: ContentImageTemplateType;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<ImagesRequest>(request, "images.readJson");
    const kind = body.kind || "content";

    if (kind !== "content") {
      return apiBadRequest("当前图片接口仅处理笔记内容配图；封面图请使用封面生成接口");
    }

    if (!body.input) {
      return apiBadRequest("请提供图片生成输入");
    }

    const fallbackPlan = createFallbackContentImagePlan(body.input, body.templateType);
    const aiResult = await generateWorkflowJson<Partial<ContentImagePlan>>({
      action: "images.generateContentPlan",
      prompt: buildContentImagePrompt(
        body.input,
        fallbackPlan.templateType,
        assetAspect(DEFAULT_TARGET_ID, "content")
      ),
      fallback: fallbackPlan,
      maxTokens: 2200,
    });
    const plan = normalizeContentImagePlan(aiResult.result, fallbackPlan);

    return apiOk(
      {
        input: body.input,
        plan,
        writeBack: false,
        usedFallback: aiResult.usedFallback,
        provider: aiResult.provider,
      },
      aiResult.usedFallback ? "未检测到 AI 配置，已用规则生成内容配图" : "内容配图方案生成成功"
    );
  } catch (error) {
    return apiError(error, "images.generateContentPlan", "内容配图生成失败");
  }
}
