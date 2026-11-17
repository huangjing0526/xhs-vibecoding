import { UserFacingError } from "../errors";
import type { TemplateDefinition, TemplateInputField, TemplateInputValues } from "./types";

/**
 * 表单值的构造与校验。
 *
 * 与 registry.ts 分开是因为**客户端要用这些函数，但不该拿到注册表**：
 * registry.ts 顶层持有 TEMPLATE_PACKS 且带模块级校验，无法 tree-shake，
 * 一旦客户端 import 它，所有模板包都会进浏览器包体——P1 的服务商配置、
 * P3 迁入的道库/术语库都会跟着泄进去。这里只依赖类型，不碰任何包。
 */

function isBlank(value: TemplateInputValues[string]): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return !value.trim();
  return false;
}

/**
 * 只校验模板自己声明的 required，不额外加长度、格式这类规则——
 * 模板配置说了算，校验器不替模板做主。
 */
export function assertRequiredInputs(template: TemplateDefinition, values: TemplateInputValues): void {
  const missing = template.inputs
    .filter((field: TemplateInputField) => field.required && isBlank(values[field.key]))
    .map((field) => field.label);

  if (missing.length > 0) {
    throw new UserFacingError(`请先填写：${missing.join("、")}`);
  }
}

/** 表单初值：每个字段按类型给空值，避免 React 受控组件从 undefined 跳到有值。 */
export function createEmptyInputValues(template: TemplateDefinition): TemplateInputValues {
  const values: TemplateInputValues = {};
  for (const field of template.inputs) {
    if (field.type === "number") values[field.key] = 0;
    else if (field.type === "select") values[field.key] = field.options?.[0]?.value || "";
    else values[field.key] = "";
  }
  return values;
}
