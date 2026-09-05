export type ImageCliProvider = "codex" | "gemini" | "grok";

/**
 * 一个出图引擎能接受什么。
 *
 * 和 lib/videoFactory 的 PROVIDER_CAPS 是同一个思路，但这里要多表达一件事：
 * **比例是硬参数还是一句建议**。Gemini 走 API，比例是 `imageConfig.aspectRatio`，
 * 传表外的值直接 400；codex / grok 走 CLI，比例只是提示词里的「目标比例：3:4」，
 * 模型尽力而为、不报错也不保证。同一个模板换个引擎行为就不同，
 * 这个差别以前只存在于各自的实现里，谁也看不见。
 */
export interface ImageGenCapability {
  /** cli = 起本机进程，图按路径给；http = 图随请求内联送走 */
  transport: "cli" | "http";
  /**
   * 能当硬参数交出去的比例。
   * 空数组表示这个引擎不收比例参数——比例只能写进提示词，出来什么样看模型。
   */
  aspectRatios: readonly string[];
  /** 参考图总字节上限；0 表示无明确上限（CLI 直接读本机文件，不进请求体） */
  maxInputBytes: number;
  /** 不指定模型能不能跑。CLI 有自己的默认模型，HTTP 引擎必须显式给 */
  needsExplicitModel: boolean;
}

export const IMAGE_PROVIDER_CAPS: Record<ImageCliProvider, ImageGenCapability> = {
  // CLI 通道：比例靠提示词交代，参考图按绝对路径给，模型留空就跟随 CLI 自己的默认值
  codex: { transport: "cli", aspectRatios: [], maxInputBytes: 0, needsExplicitModel: false },
  grok: { transport: "cli", aspectRatios: [], maxInputBytes: 0, needsExplicitModel: false },
  gemini: {
    transport: "http",
    // 照官方文档，传表外的值会 400
    aspectRatios: [
      "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
      // 长条比例，做头图 / 横幅会用到
      "1:4", "1:8", "4:1", "8:1",
    ],
    // base64 会膨胀约 1/3，请求体里还要再占几份，所以按源文件字节卡在 13MB
    maxInputBytes: 13 * 1024 * 1024,
    needsExplicitModel: true,
  },
};

/**
 * 这个引擎能不能**保证**出这个比例。
 * false 有两种情况，对用户是同一件事（出来可能不是这个比例）：
 * 引擎压根不收比例参数（CLI），或者收但不认这个值（Gemini 的表外比例）。
 */
export function ratioIsEnforced(provider: ImageCliProvider, ratio: string): boolean {
  const caps = IMAGE_PROVIDER_CAPS[provider];
  return caps.aspectRatios.length > 0 && caps.aspectRatios.includes(ratio);
}

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

/**
 * 人设包：一条 = 气质长相 + 妆容 + 发型写成一段互洽的措辞，单选。
 * 生成时追加到用户补充之后，不写进输入框；传了模特参考图则整组不生效——身份跟图走。
 */
export interface ImageStylePreset {
  id: string;
  label: string;
  prompt: string;
}

/** 场景预设：模板层只放规则，画面场景拆到这里，点选后写进「补充生成要求」。 */
export interface ImageScenePreset {
  id: string;
  label: string;
  prompt: string;
  /** 所属分组，UI 据此分档展示；不填的与其它无分组预设一起平铺。 */
  group?: string;
  /** 这组场景的封面样例，取每组第一条填了的那张；没有就只显示组名。 */
  preview?: string;
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
  /** 可点选的人设包，决定「生成一个什么样的人」；只对不传参考图的生成生效。 */
  stylePresets?: ImageStylePreset[];
  thumb?: ImageTemplateThumb;
  /** 该模板真实跑出来的一张样例，用作卡片预览；没有就回落到 thumb 的示意图。 */
  preview?: string;
  /** 产出的是哪种可复用参考素材，结果区据此给出「存入 X 库」入口；不填表示产出不入库。 */
  producesAsset?: LibraryKind;
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
 * 可复用参考素材库的三种：模特 / 产品 / 场景。
 * 三者的存法、增删、入库校验完全一样，只有文案不同，所以整套按 kind 参数化，不各写一套。
 */
export type LibraryKind = "models" | "products" | "scenes";

/**
 * 可复用参考素材库里的一条：图片存在本机 .local 目录，列表只带取图地址，不内联图片本体。
 * 三种库共用这个形状——存法和增删完全一样，只有文案不同。
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

/**
 * 作品：一次生成落在本机的一张产出。
 * 与素材库条目的区别是「产出 vs 输入」——作品是刚跑出来的结果，
 * 觉得值得反复用才「存入资产库」晋升成素材。
 */
export interface WorkEntry {
  /** 前端列表用的稳定键；定位产物仍然靠 jobId + dir 两段，各自校验 */
  id: string;
  jobId: string;
  /** 产物在运行目录下的子目录名；单图产出为空串 */
  dir: string;
  templateId: string;
  templateName: string;
  category: string;
  /** 多视图产出才有，用来区分同一次运行里的哪一张 */
  viewLabel?: string;
  provider: ImageCliProvider;
  model?: string;
  aspectRatio: string;
  /** 这次跑的补充要求，回头想复现同一张图时要看它 */
  customPrompt?: string;
  createdAt: string;
  /** 产物文件名，取图与下载都按它拼 */
  file: string;
  imageUrl: string;
  /** 产物绝对路径，「存入资产库」与「另存到输出目录」要用 */
  outputPath: string;
}

/** 模特库条目。历史名字，保留给已有调用方。 */
export type ModelAssetEntry = LibraryAssetEntry;

/** 产品库条目。 */
export type ProductAssetEntry = LibraryAssetEntry;
