import type { ImageFactoryTemplate } from "../types";

/** 通用改图：不绑定主体也不绑定坑位，任何素材都能进；自建模板默认也落这一类。 */
export const GENERAL_TEMPLATES: ImageFactoryTemplate[] = [
  {
    id: "style-transfer",
    name: "风格复刻",
    category: "通用与自建",
    description: "保持主体内容，复刻参考图的视觉语言。",
    prompt: "保持主体身份、轮廓和关键内容不变，只借鉴风格参考图的构图、配色、光线、材质表现与视觉氛围。不要复制参考图中的人物、品牌、文字或独特标识。",
    aspectRatio: "1:1",
    thumb: "style-transfer",
    preview: "/template-previews/style-transfer.jpg",
    slots: [
      { id: "subject", label: "主体图", description: "最终图片必须保留的主体", required: true },
      { id: "style", label: "风格参考", description: "用于参考构图、颜色和光线", required: true },
    ],
    builtIn: true,
  },
];
