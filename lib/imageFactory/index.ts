import type { ImageFactoryTemplate } from "./types";
import { CREATIVE_TEMPLATES } from "./templates/creative";
import { ECOMMERCE_TEMPLATES } from "./templates/ecommerce";
import { FASHION_TEMPLATES } from "./templates/fashion";
import { MODEL_TEMPLATES } from "./templates/model";
import { XHS_TEMPLATES } from "./templates/xhs";

export * from "./types";
export * from "./profiles";

/** 数组顺序决定模板库里分类标签与卡片的先后，改顺序前先想清楚 UI 影响。 */
export const BUILT_IN_IMAGE_TEMPLATES: ImageFactoryTemplate[] = [
  ...MODEL_TEMPLATES,
  ...ECOMMERCE_TEMPLATES,
  ...FASHION_TEMPLATES,
  ...XHS_TEMPLATES,
  ...CREATIVE_TEMPLATES,
];

export const IMAGE_FACTORY_STORAGE_KEY = "vibenote.image-factory.templates.v1";

/**
 * 自建模板存在本机浏览器里。图片工厂与模板目录都要读它，
 * 各写一份必然漂移，所以读取收在这里，两边共用。
 */
export function loadCustomImageTemplates(): ImageFactoryTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(IMAGE_FACTORY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[ImageFactory] 自建模板读取失败", { action: "imageFactory.loadTemplates", error });
    return [];
  }
}
