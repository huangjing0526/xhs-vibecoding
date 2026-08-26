export type ImageCliProvider = "codex" | "gemini" | "grok";

/** 模板示意图标识，对应 TemplateThumb 里的一张内联 SVG；自建模板不填走通用兜底。 */
export type ImageTemplateThumb =
  | "model-asset"
  | "model-poses"
  | "white-bg"
  | "product-scene"
  | "commerce-hero"
  | "model-tryon"
  | "flat-to-model"
  | "mirror-selfie"
  | "storefront"
  | "outdoor-street"
  | "portrait-studio"
  | "detail-shots"
  | "compare-grid"
  | "note-flatlay"
  | "talking-head"
  | "brand-kit"
  | "style-transfer"
  | "hanger-shot"
  | "garment-views"
  | "cover-base";

export interface ImageTemplateSlot {
  id: string;
  label: string;
  description: string;
  required: boolean;
  /** 填了就允许从模特库直接选一张已存的模特图，省掉重新上传。 */
  fromModelLibrary?: boolean;
}

/** 多视图模板的一个输出视角，一个视角对应一次 CLI 生成。 */
export interface ImageTemplateView {
  id: string;
  label: string;
  hint: string;
  /** 这个视角自己的画幅；不填跟模板走。头肩近景和全身站姿本就不该是同一个比例。 */
  aspectRatio?: string;
  /** 所属分组，UI 据此成组显示并提供「只出这组」；不填归到默认组。 */
  group?: string;
  /** 这个视角跑出来的样例，勾选前就能看到它长什么样；没有就只显示名称。 */
  preview?: string;
}

/** 场景预设：模板层只放规则，画面场景拆到这里，点选后写进「补充生成要求」。 */
export interface ImageScenePreset {
  id: string;
  label: string;
  prompt: string;
}

export interface ImageFactoryTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
  aspectRatio: string;
  slots: ImageTemplateSlot[];
  /** 有 views 的模板一次运行出多张图；不填按单图处理。 */
  views?: ImageTemplateView[];
  /** 可点选的画面场景，选中即填进补充要求；模板规则不受影响。 */
  scenePresets?: ImageScenePreset[];
  thumb?: ImageTemplateThumb;
  /** 该模板真实跑出来的一张样例，用作卡片预览；没有就回落到 thumb 的示意图。 */
  preview?: string;
  /** 产出的是可复用的模特资产，结果区据此给出「存入模特库」入口。 */
  producesModelAsset?: boolean;
  /**
   * 库里可能已经有现成的，进来先给「直接选现成的」，其次才是生成。
   * 模特这种一次做齐、反复复用的资产，默认让人再生成一遍是纯浪费。
   */
  libraryFirst?: boolean;
  /** 产出后能交给下一环继续加工；cover 表示可拿去封面编辑器叠标题。 */
  handoff?: "cover";
  builtIn?: boolean;
}

/** 引擎下可选的一个驱动模型，id 直接透传给 CLI 的 --model / -m。 */
export interface ImageCliModel {
  id: string;
  label: string;
}

export interface CliProviderStatus {
  id: ImageCliProvider;
  name: string;
  available: boolean;
  authenticated: boolean;
  version?: string;
  message: string;
  /** 探测到的可选模型；探不出来就只有一条默认项，UI 仍允许手填。 */
  models: ImageCliModel[];
  /** 不选模型时 CLI 自己会用的那个，用于在下拉里标出「默认」。 */
  defaultModel?: string;
}

export interface ImageGenerationResult {
  jobId: string;
  provider: ImageCliProvider;
  /** 本次实际指定的驱动模型；没指定就是 CLI 自己的默认值 */
  model?: string;
  imageDataUrl: string;
  outputPath: string;
  /** 本次运行的产物目录，前端直接展示，不用从 outputPath 反推 */
  runDir: string;
  /** 服务端定下的文件扩展名（含点），下载时直接用，避免前端再猜一遍 */
  extension: string;
  prompt: string;
  /** 多视图模板才有，用于结果图集里标注这张是哪个视角。 */
  viewId?: string;
  viewLabel?: string;
}

/** 编辑器里可选的示意图，顺序即下拉顺序；不选走通用兜底。 */
export const IMAGE_TEMPLATE_THUMB_OPTIONS: Array<{ id: ImageTemplateThumb; label: string }> = [
  { id: "model-asset", label: "模特资产" },
  { id: "model-poses", label: "模特多姿势" },
  { id: "white-bg", label: "白底多视角" },
  { id: "product-scene", label: "商品场景" },
  { id: "commerce-hero", label: "主视觉" },
  { id: "detail-shots", label: "细节特写" },
  { id: "compare-grid", label: "左右分屏" },
  { id: "model-tryon", label: "人物换装" },
  { id: "flat-to-model", label: "平铺变上身" },
  { id: "mirror-selfie", label: "对镜自拍" },
  { id: "storefront", label: "门店" },
  { id: "outdoor-street", label: "户外" },
  { id: "portrait-studio", label: "人像海报" },
  { id: "note-flatlay", label: "俯拍摆台" },
  { id: "talking-head", label: "人物出镜" },
  { id: "brand-kit", label: "视觉素材包" },
  { id: "style-transfer", label: "风格迁移" },
  { id: "hanger-shot", label: "衣架挂拍" },
  { id: "garment-views", label: "服装三视图" },
  { id: "cover-base", label: "封面底图" },
];

/**
 * 可复用参考素材库里的一条：图片存在本机 .local 目录，列表只带取图地址，不内联图片本体。
 * 模特库和产品库共用这个形状——存法和增删完全一样，只有文案不同。
 */
export interface LibraryAssetEntry {
  id: string;
  name: string;
  /** 来源模板与视角，用于区分「同一位模特的正面/侧面」「同一件货的正面/细节」。 */
  sourceLabel: string;
  createdAt: string;
  extension: string;
  imageUrl: string;
  /**
   * 主体特征描述：模特的体貌年龄气质、产品的材质款式。
   * 只给图锁不住身份，描述跟着图一起喂给 CLI 才稳得住同一个人 / 同一件货。
   */
  traits?: string;
}

/** 模特库条目。历史名字，保留给已有调用方。 */
export type ModelAssetEntry = LibraryAssetEntry;

/** 产品库条目。 */
export type ProductAssetEntry = LibraryAssetEntry;
