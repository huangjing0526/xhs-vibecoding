import { UserFacingError } from "../errors";
import { AI_CODING_PACK } from "./packs/ai-coding";
import type { TemplateDefinition, TemplatePack } from "./types";

/**
 * 模板注册表：画廊接口与生成接口读这一份。
 *
 * 新增模板包 = 在这个数组里加一项。顺序即画廊分栏顺序。
 *
 * **仅服务端**：客户端要的表单工具在 ./inputs.ts，不要从这里 import——
 * 顶层的 TEMPLATE_PACKS 无法 tree-shake，会把所有包（含 P1 的服务商配置）带进浏览器。
 */
export const TEMPLATE_PACKS: TemplatePack[] = [AI_CODING_PACK];

const TEMPLATE_INDEX = new Map<string, TemplateDefinition>(
  TEMPLATE_PACKS.flatMap((pack) => pack.templates.map((template) => [template.id, template]))
);

/** 启动即暴露重复 id，而不是等运行时索引悄悄丢掉后注册的那个。 */
const TOTAL_TEMPLATES = TEMPLATE_PACKS.reduce((sum, pack) => sum + pack.templates.length, 0);
if (TEMPLATE_INDEX.size !== TOTAL_TEMPLATES) {
  throw new Error(`模板 id 重复：注册 ${TOTAL_TEMPLATES} 个，去重后只剩 ${TEMPLATE_INDEX.size} 个`);
}

/** 生成接口用：拿不到模板是调用方传错了 id，属用户可修复，走 400 而非 500。 */
export function getTemplateOrThrow(id: string): TemplateDefinition {
  const template = TEMPLATE_INDEX.get(id);
  if (!template) {
    throw new UserFacingError(`未找到模板「${id}」，请刷新页面后重试`);
  }
  return template;
}
