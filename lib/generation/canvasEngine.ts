import {
  buildContentImagePrompt,
  createFallbackContentImagePlan,
  normalizeContentImagePlan,
  type ContentImagePlan,
  type ContentImageTemplateType,
  type ImageWorkflowSourceInput,
} from "../imageWorkflow";
import type { AspectId } from "../targets";
import type { TemplateDefinition, TemplateInputValues, TemplateRunResult } from "../templates/types";
import { generateWorkflowJson } from "../workflowAi";

/**
 * canvas 引擎：出内容配图的结构化方案。
 *
 * 只到 plan 为止——真正的绘制在浏览器（renderContentImageDataUrl 吃 HTMLCanvasElement），
 * 服务端画不了。
 *
 * 模板库的 canvas 引擎与既有的 /api/feishu/images 走同一条链路，所以收在这里由两边共用，
 * 而不是各写一遍 fallback → AI → normalize 的三段式。
 */
export async function generateContentImagePlan(options: {
  input: ImageWorkflowSourceInput;
  templateType?: ContentImageTemplateType;
  aspect: AspectId;
}): Promise<{ plan: ContentImagePlan; usedFallback: boolean; provider: string }> {
  const fallbackPlan = createFallbackContentImagePlan(options.input, options.templateType);

  const aiResult = await generateWorkflowJson<Partial<ContentImagePlan>>({
    action: "images.generateContentPlan",
    prompt: buildContentImagePrompt(options.input, fallbackPlan.templateType, options.aspect),
    fallback: fallbackPlan,
    maxTokens: 2200,
  });

  return {
    plan: normalizeContentImagePlan(aiResult.result, fallbackPlan),
    usedFallback: aiResult.usedFallback,
    provider: aiResult.provider,
  };
}

function readText(values: TemplateInputValues, key: string): string {
  const value = values[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 表单值 → 配图引擎的素材输入。
 *
 * 放在引擎模块内而不是 index.ts 的分发器里：每个引擎自己认识自己要的字段，
 * 分发器只负责路由。挂 canvas 引擎的模板必须声明下列 key（见 packs/ai-coding.ts）。
 */
function toImageSourceInput(template: TemplateDefinition, values: TemplateInputValues): ImageWorkflowSourceInput {
  const content = readText(values, "content");
  return {
    sourceType: "manual",
    sourceId: template.id,
    title: readText(values, "title"),
    content,
    painPoint: readText(values, "painPoint"),
    coreViewpoint: readText(values, "coreViewpoint"),
    reusableAsset: readText(values, "reusableAsset"),
    outline: content
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

export async function runCanvasTemplate(
  template: TemplateDefinition,
  templateType: ContentImageTemplateType,
  values: TemplateInputValues
): Promise<TemplateRunResult> {
  const result = await generateContentImagePlan({
    input: toImageSourceInput(template, values),
    templateType,
    aspect: template.aspect,
  });

  return {
    templateId: template.id,
    output: { kind: "canvas-plan", plan: result.plan },
    usedFallback: result.usedFallback,
    provider: result.provider,
  };
}
