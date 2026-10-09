/**
 * 商品品类与各自最容易在 AI 视频里坏掉的地方。
 *
 * 通用的「不要模糊、不要变形」管不住电商的真问题：印花 T 恤怕字母乱码，
 * 工装裤怕口袋消失，修身上衣怕肩线塌。按品类写死易错处，生成和验收都照这张表盯。
 */
export interface ProductCategory {
  id: string;
  label: string;
  /** 写进运动提示词与验收提示词的那句易错处 */
  risks: string;
}

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  { id: "printed-top", label: "印花上衣", risks: "印花、字母和 logo 不得乱码、增减或移位，图案大小与位置不变" },
  { id: "fitted-top", label: "衬衫/修身上衣", risks: "领型和肩线不塌不变，纽扣数量与门襟结构不变，衣长不变" },
  { id: "dress-skirt", label: "连衣裙/半裙", risks: "裙长与腰线位置不变，褶皱和开衩结构不变" },
  { id: "pants", label: "裤装", risks: "裤型不收窄不贴腿，口袋、腰头和裤长不变" },
  { id: "outerwear", label: "外套", risks: "门襟、拉链、口袋结构和衣长不变，帽子与领子不消失" },
  { id: "shoes", label: "鞋", risks: "鞋型、鞋带孔数和 logo 不变，左右脚是同一双" },
  { id: "bag", label: "包", risks: "包型、五金件、肩带数量与位置不变" },
  { id: "jewelry", label: "首饰配饰", risks: "尺寸比例不变，不与手指或皮肤穿模，链条不断开" },
  { id: "beauty", label: "美妆护肤", risks: "瓶身文字不乱码，瓶型、瓶盖和容量不变" },
  { id: "food", label: "食品饮料", risks: "包装文字和图案不乱码，包装形状不变" },
  { id: "electronics", label: "数码家电", risks: "按键、接口的数量与位置不变，屏幕内容不乱跳" },
  { id: "other", label: "其他", risks: "主体结构、颜色和表面文字不变" },
];

export function productCategory(id: string | undefined): ProductCategory | null {
  return PRODUCT_CATEGORIES.find((item) => item.id === id) || null;
}
