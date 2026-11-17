import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../feishu/_utils";
import { runEngine } from "@/lib/generation";
import { assertRequiredInputs } from "@/lib/templates/inputs";
import { getTemplateOrThrow } from "@/lib/templates/registry";
import type { TemplateInputValues } from "@/lib/templates/types";

interface GenerateRequest {
  templateId?: string;
  values?: TemplateInputValues;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<GenerateRequest>(request, "templates.generate.readJson");

    if (!body.templateId) {
      return apiBadRequest("请先选择一个模板");
    }

    // 未注册的 id 与缺必填项都由 lib 层抛 UserFacingError，apiError 统一转 400
    const template = getTemplateOrThrow(body.templateId);
    const values = body.values || {};
    assertRequiredInputs(template, values);

    const result = await runEngine(template, values);

    return apiOk(
      result,
      result.usedFallback ? "未检测到 AI 配置，已用规则生成方案" : `「${template.name}」生成成功`
    );
  } catch (error) {
    return apiError(error, "templates.generate", "模板生成失败");
  }
}
