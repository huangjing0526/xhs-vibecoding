import type { ImageFactoryTemplate } from "./types";
import { CONTENT_TEMPLATES } from "./templates/content";
import { GENERAL_TEMPLATES } from "./templates/general";
import { MODEL_TEMPLATES } from "./templates/model";
import { OUTFIT_TEMPLATES } from "./templates/outfit";
import { PRODUCT_DETAIL_TEMPLATES, PRODUCT_HERO_TEMPLATES } from "./templates/product";

export * from "./types";
export * from "./profiles";
export * from "./libraries";

/**
 * 分类按单一判据划开，同一层内不混维度：
 * 模特资产（有人无货）→ 商品主图（有货无人·主图位）→ 详情图（有货无人·详情位）
 * → 上身穿搭（人穿着货）→ 内容配图（进内容位不进商详页）→ 通用与自建（不绑定主体与坑位）。
 * 数组顺序即分类标签与卡片的先后，改顺序前先想清楚 UI 影响。
 */
export const BUILT_IN_IMAGE_TEMPLATES: ImageFactoryTemplate[] = [
  ...MODEL_TEMPLATES,
  ...PRODUCT_HERO_TEMPLATES,
  ...PRODUCT_DETAIL_TEMPLATES,
  ...OUTFIT_TEMPLATES,
  ...CONTENT_TEMPLATES,
  ...GENERAL_TEMPLATES,
];

/** 自建模板落这一类；老数据里的「自建」进来时统一改写成它。 */
export const CUSTOM_TEMPLATE_CATEGORY = "通用与自建";
const LEGACY_CUSTOM_CATEGORIES = ["自建"];

export const IMAGE_FACTORY_STORAGE_KEY = "vibenote.image-factory.templates.v1";

/**
 * 自建模板存在本机浏览器里。图片工厂与模板目录都要读它，
 * 各写一份必然漂移，所以读取收在这里，两边共用。
 */
export function loadCustomImageTemplates(): ImageFactoryTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(IMAGE_FACTORY_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    // 分类改版前存下的自建模板还带着老标签，放着不管会在 tab 上多出一个孤零零的分组。
    return parsed.map((template: ImageFactoryTemplate) =>
      LEGACY_CUSTOM_CATEGORIES.includes(template.category)
        ? { ...template, category: CUSTOM_TEMPLATE_CATEGORY }
        : template
    );
  } catch (error) {
    console.warn("[ImageFactory] 自建模板读取失败", { action: "imageFactory.loadTemplates", error });
    return [];
  }
}

/**
 * 把「3:4」这类声明画幅换成 CSS 的 aspect-ratio。
 * 样例框从前写死 4/5 与正方形，跟头部标的画幅对不上——同一张图，
 * 上面说 1:1、下面摆一张竖图，人只能按摆出来的那个形状去理解产出。
 * 自建模板的比例是手填的自由文本，解不出来就退回正方形：
 * 这里永远给得出一个形状，调用处才不用再挂一个 aspect-* 类当备胎。
 */
export function aspectRatioStyle(ratio?: string): { aspectRatio: string } {
  const [width, height] = (ratio || "").split(/[:/]/).map(Number);
  return width > 0 && height > 0 ? { aspectRatio: `${width} / ${height}` } : { aspectRatio: "1 / 1" };
}

/**
 * 自建模板的写入口。
 * 图片工厂和模板目录都能新建/删除，各写一遍 localStorage 必然漂移，所以写也跟读一样收在这里。
 *
 * 不收「当前列表」参数、自己读一遍再写：调用方手上那份可能已经过时（两个页面各存一份 state），
 * 而且一旦有 current 参数，写就会被顺手塞进 setState 的更新函数里——更新函数必须是纯的，
 * StrictMode 下会跑两遍。让模块自己拥有存储，这个坑就不存在。
 */
export function saveCustomImageTemplate(template: ImageFactoryTemplate): ImageFactoryTemplate[] {
  const current = loadCustomImageTemplates();
  const next = current.some((item) => item.id === template.id)
    ? current.map((item) => (item.id === template.id ? template : item))
    : [...current, template];
  persistCustomImageTemplates(next);
  return next;
}

export function deleteCustomImageTemplate(templateId: string): ImageFactoryTemplate[] {
  const next = loadCustomImageTemplates().filter((item) => item.id !== templateId);
  persistCustomImageTemplates(next);
  return next;
}

/** 写失败就抛：存不下还告诉人「已保存」，比报错更糟。调用方负责把话说给用户听。 */
function persistCustomImageTemplates(templates: ImageFactoryTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IMAGE_FACTORY_STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    console.error("[ImageFactory] 自建模板写入失败", {
      action: "imageFactory.saveTemplates",
      count: templates.length,
      error,
    });
    throw error;
  }
}

/** 新建自建模板的空白草稿，图片工厂与模板目录共用一份，免得两处字段对不上。 */
export function newCustomImageTemplate(): ImageFactoryTemplate {
  return {
    id: `custom-${Date.now().toString(36)}`,
    name: "新模板",
    category: CUSTOM_TEMPLATE_CATEGORY,
    description: "",
    prompt: "",
    aspectRatio: "1:1",
    slots: [{ id: "subject", label: "主体图", description: "", required: true }],
  };
}

/** 自建模板编辑器的分类候选：内置分类 + 已有自建分类，去重。两处挂编辑器，别各算各的。 */
export function imageTemplateCategories(customTemplates: ImageFactoryTemplate[]): string[] {
  return [...new Set([...BUILT_IN_IMAGE_TEMPLATES, ...customTemplates].map((item) => item.category))];
}
