import { CONTENT_IMAGE_TEMPLATES, type ContentImageTemplateDefinition } from "../../imageWorkflow";
import type { TemplateDefinition, TemplateInputField, TemplatePack } from "../types";

/**
 * AI Coding 信息图包：把现有的 6 个内容配图模板搬进模板库。
 *
 * 「搬」= 包装而非复制。name / description / previewTone 仍以 imageWorkflow.ts 的
 * CONTENT_IMAGE_TEMPLATES 为单一事实源，这里只补模板库需要的外壳（inputs、引擎配置）。
 * 抄一份会让画廊和配图工作台各说各话——改了一处忘了另一处。
 */

const PACK_ID = "ai-coding";

/**
 * 6 个模板共用一套输入：它们的差别只在排版样式，喂给引擎的素材字段是同一批。
 * key 与 lib/generation/canvasEngine.ts 读取的字段名一致。
 */
const SHARED_INPUTS: TemplateInputField[] = [
  {
    key: "title",
    label: "标题",
    type: "text",
    required: true,
    placeholder: "这张图讲什么",
  },
  {
    key: "content",
    label: "内容要点",
    type: "textarea",
    placeholder: "一行一条，或直接粘正文",
    hint: "图里的节点从这里提炼，写得越具体画得越准",
  },
  {
    key: "painPoint",
    label: "读者痛点",
    type: "text",
    placeholder: "选填，这张图帮读者解决什么问题",
  },
  {
    key: "coreViewpoint",
    label: "核心观点",
    type: "text",
    placeholder: "选填，想让读者记住的一句话",
  },
  {
    key: "reusableAsset",
    label: "可收藏资产",
    type: "text",
    placeholder: "选填，如提示词 / 清单 / 表格字段",
  },
];

function toTemplate(source: ContentImageTemplateDefinition): TemplateDefinition {
  return {
    id: `${PACK_ID}-${source.id}`,
    name: source.name,
    description: source.description,
    previewTone: source.previewTone,
    outputKind: "image",
    // 模板自己声明产出比例，不反查发布目标注册表——见 lib/targets.ts 头部约定。
    aspect: "3:4",
    inputs: SHARED_INPUTS,
    engineConfig: { engine: "canvas", templateType: source.id },
  };
}

export const AI_CODING_PACK: TemplatePack = {
  id: PACK_ID,
  name: "AI Coding 信息图",
  description: "把方法、流程、清单画成可收藏的笔记配图，代码绘制不调生图模型。",
  templates: CONTENT_IMAGE_TEMPLATES.map(toTemplate),
};
