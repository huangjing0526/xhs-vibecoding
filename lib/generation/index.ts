import type { TemplateDefinition, TemplateInputValues, TemplateRunResult } from "../templates/types";
import { runCanvasTemplate } from "./canvasEngine";

/**
 * 引擎分发：模板声明用哪个引擎，这里只负责路由到对应实现，
 * 字段适配、prompt 组装这些都归各引擎模块自己管。
 *
 * P0 只有 canvas。P1 接生图时在 TemplateEngineConfig 加分支，下面的 switch
 * 会因 exhaustive 检查而编译失败，从而强制补齐实现——不会静默漏掉。
 */
export async function runEngine(
  template: TemplateDefinition,
  values: TemplateInputValues
): Promise<TemplateRunResult> {
  const config = template.engineConfig;

  switch (config.engine) {
    case "canvas":
      return runCanvasTemplate(template, config.templateType, values);
    default: {
      const unreachable: never = config.engine;
      throw new Error(`未实现的模板引擎：${unreachable}`);
    }
  }
}
