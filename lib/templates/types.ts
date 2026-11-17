import type { ContentImagePlan, ContentImageTemplateType } from "../imageWorkflow";
import type { AspectId } from "../targets";

/**
 * 模板 = 一份产出配方：要什么输入、调哪个引擎、出什么规格。
 *
 * 与 lib/imageWorkflow.ts 的 CONTENT_IMAGE_TEMPLATES 的分工：那里的「模板」是排版样式
 * （画成流程图还是清单图），只覆盖 canvas 引擎内部；这里的模板是用户在画廊里选的那一张卡，
 * 一个模板可以挂任意引擎。前者是后者 canvas 分支的一个参数——见 TemplateEngineConfig。
 *
 * 目标形态见 docs/template-library-plan.md：加一个模板应该只是加一份配置，不改 UI 代码。
 * 这条靠 inputs 驱动表单自动渲染来兑现，所以字段一律声明式，不放函数。
 */

export type TemplateInputType = "text" | "textarea" | "select" | "number";

export interface TemplateInputOption {
  value: string;
  label: string;
}

export interface TemplateInputField {
  key: string;
  label: string;
  type: TemplateInputType;
  required?: boolean;
  placeholder?: string;
  /** 补充填写规则，与 label 不重复说同一件事。 */
  hint?: string;
  /** type=select 时的选项。 */
  options?: TemplateInputOption[];
  /** type=number 时的取值上限。 */
  max?: number;
}

/** 表单收集到的原始值，按字段类型收字符串或数字。 */
export type TemplateInputValues = Record<string, string | number | undefined>;

/**
 * 引擎与其参数绑成可辨识联合，而不是 `engine: EngineId` + 一袋松散配置——
 * 后者表示得出「engine 是 canvas 却带着 t2i 的 promptTemplate」这种非法状态。
 *
 * P1 在此追加 t2i / i2i 分支（含 promptTemplate 与 preferredProviders），
 * 已有模板不受影响，这正是 P0 要验证的扩展成本。
 */
export type TemplateEngineConfig = {
  engine: "canvas";
  /** 交给 lib/imageWorkflow.ts 的排版样式。 */
  templateType: ContentImageTemplateType;
};

/**
 * 产出类型的用户可见说明，画廊直接读它做角标。
 *
 * 放在配置侧而不是让 UI 维护一张 engine→文案 的映射：产出是什么不是 UI 的知识，
 * 由 UI 反推会让「加模板 = 只加配置」在接入新引擎时立刻失效。
 */
export type TemplateOutputKind = "image" | "video" | "script";

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  /** 画廊卡片上的一行「产出长什么样」。P0 用文字，接生图后换成真实预览图。 */
  previewTone: string;
  outputKind: TemplateOutputKind;
  aspect: AspectId;
  inputs: TemplateInputField[];
  engineConfig: TemplateEngineConfig;
}

export interface TemplatePack {
  id: string;
  name: string;
  /** 画廊分栏下的一行说明：这一组模板服务于什么场景。 */
  description: string;
  templates: TemplateDefinition[];
}

/**
 * 引擎产出。
 *
 * canvas 引擎的绘制发生在**浏览器**（renderContentImageDataUrl 吃 HTMLCanvasElement），
 * 服务端只能出结构化的 plan，由前端结果页渲成图。
 *
 * 目前只有一种形态，仍写成可辨识联合：P1 的生图走异步任务（提交 → 轮询），
 * 与「服务端直接给结果」不是同一种东西，届时在这里加分支，消费侧的 switch 会被强制补齐。
 * 比例不进这里——它是模板的声明（TemplateDefinition.aspect），产出不必再复述一遍。
 */
export type TemplateOutput = { kind: "canvas-plan"; plan: ContentImagePlan };

export interface TemplateRunResult {
  templateId: string;
  output: TemplateOutput;
  /** AI 不可用时走了规则兜底，UI 据此提示用户产出质量会降。 */
  usedFallback: boolean;
  provider: string;
}
