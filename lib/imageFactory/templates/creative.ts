import type { ImageFactoryTemplate } from "../types";

/** 风格复刻与品牌视觉素材。 */
export const CREATIVE_TEMPLATES: ImageFactoryTemplate[] = [
  {
    id: "style-transfer",
    name: "风格复刻",
    category: "创意",
    description: "保持主体内容，复刻参考图的视觉语言。",
    prompt: "保持主体身份、轮廓和关键内容不变，只借鉴风格参考图的构图、配色、光线、材质表现与视觉氛围。不要复制参考图中的人物、品牌、文字或独特标识。",
    aspectRatio: "1:1",
    thumb: "style-transfer",
    slots: [
      { id: "subject", label: "主体图", description: "最终图片必须保留的主体", required: true },
      { id: "style", label: "风格参考", description: "用于参考构图、颜色和光线", required: true },
    ],
    builtIn: true,
  },
  {
    id: "brand-kit",
    name: "品牌视觉包",
    category: "创意",
    description: "从一张参考图提炼视觉语言，出一组留白的封面底图与背景。",
    prompt: "从参考图提炼一套统一的视觉语言，生成可复用的素材。保持参考图的配色、材质感、光线氛围与构图逻辑；不要复制参考图中的人物、文字、logo 或任何独特标识。画面要留出足够干净的空白区域，方便后续叠加标题与文字。质感真实细腻，避免塑料感与过度渲染。画面中不出现任何文字、水印与品牌标识。只输出一张图片。",
    aspectRatio: "3:4",
    thumb: "brand-kit",
    slots: [
      { id: "reference", label: "视觉参考", description: "用于提炼配色、材质与氛围的参考图", required: true },
    ],
    views: [
      { id: "hero", label: "主视觉", hint: "可作封面底图的主视觉画面，主体偏一侧，中心或上方留出叠字空间" },
      { id: "backdrop", label: "纯背景", hint: "几乎没有主体的纯背景底图，只有材质与光影层次，整片可叠字" },
      { id: "texture", label: "局部纹理", hint: "材质或纹理的近距离特写，可作分隔条与点缀元素" },
      { id: "ambience", label: "氛围延展", hint: "同一视觉语言下的场景氛围图，用于系列内容的第二第三张" },
    ],
    builtIn: true,
  },
];
