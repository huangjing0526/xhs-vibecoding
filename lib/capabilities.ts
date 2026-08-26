import {
  BarChart3,
  Clapperboard,
  Eraser,
  Film,
  Flame,
  FolderOpen,
  Home,
  Images,
  Inbox,
  LayoutGrid,
  Library,
  PenLine,
  Radar,
  Scissors,
  Shapes,
  ShieldCheck,
  Type,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * 全站能力目录的单一事实源。
 * 侧栏图标轨、首页卡片、工具目录、命令面板、页头标题全部从这里派生——
 * 新增一个区只改这一个文件，杜绝「导航标签 ≠ 页头标题 ≠ 首页卡片文案」的三处漂移。
 *
 * 五个名词各站生产链的一格，判据互斥，一件东西只可能落一格：
 *   素材  外面进来、还没变成任何东西的原料（线索 / 文档 / 拆来的稿子）
 *   模板  别人做成什么样 + 怎么做成的，可复刻的范例（样例 + 结构 + 槽位）
 *   资产  我的、会反复用的、复刻时填进模板槽位的东西（模特 / 产品 / 场景）
 *   作品  跑出来的产出
 *   项目  一次交付，只引用上面四者，自己不存内容
 * 由此推出两条硬规则。它们不靠人记——都由类型或派生代码兜住：
 *   ① 库（素材/模板/资产/作品）与笔记步骤（视频脚本/爆款优化/发布检查）不带 category，
 *      永远不进「工具」目录——目录只放拿来就能用的动词，步骤住在项目详情页。
 *      靠 AREAS 的类型强制：给它们补 category 是类型错误，不是「下次注意」。
 *   ② 一个区在首页最多出现一次。靠 HOME_TOOL_AREAS 从常量现算，不靠三张手写表恰好不相交。
 *      唯一例外是「最近在做」行：它是快捷回位，按使用记录现算，允许与下方入口重复。
 */

/**
 * 四个名词区（存东西的地方），与动词能力相对。
 * 它们不许带 category，也就永远不会在「工具」目录里再出现一次——
 * 声明在 AREAS 之前，好让下面的类型把这条规则钉死。
 * 这里只管「谁是名词区」，摆在侧栏的哪一段由 RAIL_GROUPS 自己说了算。
 */
export const LIBRARY_AREAS = ["library", "templates", "assets", "works"] as const;
export type LibraryAreaId = (typeof LIBRARY_AREAS)[number];

/**
 * 笔记流水线的步骤区：进来必须先选中一个项目，入口在项目详情页与 ⌘K。
 * 步骤不是工具——带上 category 它就会在「工具」目录里长出第二个平级身份，
 * 点进去只会撞「先选一个项目」的空态。与库规则同一手法，由 satisfies 钉死。
 * 「这个区是不是步骤」只看这张表，不再有第二个字段把同一件事另说一遍。
 */
export const NOTE_STEP_AREAS = ["video", "rewrite", "quality"] as const;
export type NoteStepAreaId = (typeof NOTE_STEP_AREAS)[number];

/** 不许带 category 的区：名词库 + 笔记步骤。satisfies 用它把「不进工具目录」钉死在类型上。 */
type CategoryFreeAreaId = LibraryAreaId | NoteStepAreaId;

/** 一个可导航的区。结构页（首页/目录/项目/笔记）与能力页（工具）共用一套 id。 */
export type AreaId =
  | "home"
  | "tools"
  | "templates"
  | "projects"
  | "note"
  | "library"
  | "assets"
  | "works"
  | "images"
  | "textLayer"
  | "video"
  | "videoFactory"
  | "quality"
  | "review"
  | "rewrite"
  | "blogger"
  | "extract"
  | "watermark";

/**
 * 工具目录的分区，数组顺序即分类 tab 与页面分区的先后。
 * 只放不挑上下文、拿来就能用的动词。名词库在侧栏下段，笔记步骤在项目详情页，都不进这里。
 * 拆片与对标拆解按产出物归「沉淀模板」：它们跑出的不是成品，是落进模板库的可复刻结构。
 * 「沉淀模板」区的 hint 约定以动词短语开头（如「拆一条 · …」）——模板页的来源按钮直接取第一段当文案。
 */
export type ToolCategory = "做图" | "做视频" | "沉淀模板" | "复盘";
export const TOOL_CATEGORY_ORDER: ToolCategory[] = ["做图", "做视频", "沉淀模板", "复盘"];

export interface AreaDef {
  label: string;
  /** 一行说明，卡片副标题与侧栏提示共用——短到一眼扫完。 */
  hint: string;
  /** 页头副标题，比 hint 长，说清这一页在干什么。 */
  subtitle: string;
  icon: LucideIcon;
  /** 出现在工具目录的哪一区；不填 = 结构页，不进目录。 */
  category?: ToolCategory;
  /** 卡片缩略图底色，只用现有品牌色阶，纯装饰。 */
  tint: string;
}

/**
 * 库与笔记步骤都不许声明 category——前者是名词，后者是步骤，动词目录里都不该有它们。
 * 用 satisfies 把这条规则钉在字面量上：给 assets 或 quality 补一个 category 会当场编译不过；
 * 而导出的类型仍是统一的 Record<AreaId, AreaDef>，下游读 category 不用先分辨这是哪一类区。
 */
const AREA_TABLE = {
  home: {
    label: "首页",
    hint: "说一句就开工",
    subtitle: "描述你要做什么，或从下面挑一个入口。",
    icon: Home,
    tint: "from-brand-50",
  },
  tools: {
    label: "工具",
    hint: "全部能力一览",
    subtitle: "这个工作台能做的所有事，按用途分好了区。",
    icon: LayoutGrid,
    tint: "from-brand-50",
  },
  templates: {
    label: "模板",
    hint: "照着做 · 可复刻的范例",
    subtitle: "别人做成什么样、怎么做成的。挑一个「照这个做」，换上你自己的素材重新生成。",
    icon: Shapes,
    tint: "from-soft",
  },
  projects: {
    label: "项目",
    hint: "在做的每一件交付",
    subtitle: "一条选题就是一个项目，点进去从选题写到发布。",
    icon: FolderOpen,
    tint: "from-brand-50",
  },
  note: {
    label: "项目详情",
    hint: "选题到发布",
    subtitle: "从选题写到发布，一条龙做完这一篇交付。",
    icon: PenLine,
    tint: "from-brand-50",
  },
  library: {
    label: "素材",
    hint: "外面进来的原料",
    subtitle: "线索、日报、本地文档——还没变成任何东西的原料，在这里提炼成选题。",
    icon: Inbox,
    tint: "from-brand-50",
  },
  assets: {
    label: "资产",
    hint: "我的模特 · 产品 · 场景",
    subtitle: "会反复用的自有要素，存在本机。复刻模板时，缺的槽位从这里取。",
    icon: Library,
    tint: "from-soft",
  },
  works: {
    label: "作品",
    hint: "跑出来的产出",
    subtitle: "图片和视频成片都在这里，按时间倒着翻。好用的图存进资产，下次生成直接取。",
    icon: Sparkles,
    tint: "from-soft",
  },
  images: {
    label: "图片工厂",
    hint: "模特 · 电商图 · 封面",
    subtitle: "模特资产、电商图、封面底图——全部由本机 CLI 生成。",
    icon: Images,
    category: "做图",
    tint: "from-soft",
  },
  textLayer: {
    label: "叠字排版",
    hint: "封面 · 配图 · 字不糊",
    subtitle: "给图配上标题排版。文字层在本机渲染，不经过生成模型，所以字不会糊。",
    icon: Type,
    category: "做图",
    tint: "from-soft",
  },
  video: {
    label: "视频脚本",
    hint: "口播 · 分镜",
    subtitle: "把笔记转成口播 / 分镜视频脚本。",
    icon: Clapperboard,
    tint: "from-sunken",
  },
  videoFactory: {
    label: "视频工厂",
    hint: "改写 · 分镜 · 出片",
    subtitle: "对标结构改写成自己的脚本，拆成分镜，再逐镜生成 AI 视频。",
    icon: Film,
    category: "做视频",
    tint: "from-sunken",
  },
  extract: {
    label: "链接拆片",
    hint: "拆一条 · 沉成模板",
    subtitle: "粘抖音/小红书链接，只拆结构与节奏，沉淀成可复刻的模板——不搬运原画面原句。",
    icon: Scissors,
    category: "沉淀模板",
    tint: "from-sunken",
  },
  watermark: {
    label: "视频去水印",
    hint: "豆包 / Gemini 水印",
    subtitle: "去掉 AI 生成视频的水印（豆包 / Gemini 等）。",
    icon: Eraser,
    category: "做视频",
    tint: "from-sunken",
  },
  rewrite: {
    label: "爆款优化",
    hint: "对标道库改写",
    subtitle: "对标道库改写，贴近爆款结构。",
    icon: Flame,
    tint: "from-brand-100",
  },
  blogger: {
    label: "对标拆解",
    hint: "拆博主 · 沉成模板",
    subtitle: "拆解对标博主的选题结构，沉淀成可复刻的道库模板。",
    icon: Radar,
    category: "沉淀模板",
    tint: "from-brand-100",
  },
  quality: {
    label: "发布检查",
    hint: "质检 · 发布",
    subtitle: "发布前规则质检与兜底修复。",
    icon: ShieldCheck,
    tint: "from-brand-100",
  },
  review: {
    label: "数据复盘",
    hint: "看数据 · 拿建议",
    subtitle: "已发布笔记的数据表现与改进建议。",
    icon: BarChart3,
    category: "复盘",
    tint: "from-brand-100",
  },
} satisfies Record<CategoryFreeAreaId, Omit<AreaDef, "category">> &
  Record<Exclude<AreaId, CategoryFreeAreaId>, AreaDef>;

export const AREAS: Record<AreaId, AreaDef> = AREA_TABLE;

const ALL_AREAS = Object.keys(AREAS) as AreaId[];

/** 进得了工具目录的能力区，按 AREAS 声明顺序。 */
export const TOOL_AREAS: AreaId[] = ALL_AREAS.filter((id) => AREAS[id].category);

/** 工具目录的分区数据：空分区不出现，避免页面上留一个空标题。 */
export function toolSections(): Array<{ category: ToolCategory; items: AreaId[] }> {
  return TOOL_CATEGORY_ORDER.map((category) => ({
    category,
    items: TOOL_AREAS.filter((id) => AREAS[id].category === category),
  })).filter((section) => section.items.length > 0);
}

/**
 * 左侧图标轨，分三段，顺序即一条活的走法：
 *   从哪开工 —— 首页说一句话、模板照着做、工具自己挑能力
 *   东西放哪 —— 素材（原料）、作品（跑出来的）、资产（反复用的）
 *   做给谁   —— 项目，一次交付的容器，收在最后
 * 「创建」是动作不是区，单独由外壳处理，不进这个列表。
 */
export const RAIL_GROUPS: AreaId[][] = [
  ["home", "templates", "tools"],
  ["library", "works", "assets"],
  ["projects"],
];

export const RAIL_AREAS: AreaId[] = RAIL_GROUPS.flat();

/**
 * 直接坐在画布上的页：自己排版式，不套那张浮起的白面板。
 * 眼下与 RAIL_AREAS 恰好同集合，但两者判据不同（笔记详情页没有 category 也要白面板），
 * 所以分开写。改其中一个之前先想清楚要不要连着改另一个。
 */
export const PLAIN_AREAS: AreaId[] = ["home", "tools", "templates", "projects", "library", "assets", "works"];

/** ⌘K 可跳转的区：侧栏大类 + 全部工具 + 笔记步骤（步骤不进目录，但 ⌘K 要能直达）。项目详情页要先选一篇，不在其中。 */
export const COMMAND_AREAS: AreaId[] = Array.from(
  new Set<AreaId>([...RAIL_AREAS, ...TOOL_AREAS, ...NOTE_STEP_AREAS]),
);

/** 首页场景卡：最常见的开工方式，四个库都在其中——首页要教会人这条生产链。 */
export const HOME_SCENES: AreaId[] = ["templates", "projects", "library", "assets", "works", "images"];

/** 首页两张主推大卡：一条完整流水线一张，写清中间几步，避免「点进去才知道要干嘛」。 */
export const HOME_FEATURED: Array<{ id: AreaId; title: string; desc: string; steps: string[] }> = [
  { id: "library", title: "一键成篇", desc: "攒的料直接变成能发的笔记", steps: ["素材", "选题", "草稿", "封面"] },
  { id: "videoFactory", title: "爆款视频", desc: "借对标结构，用自己的素材出片", steps: ["模板", "脚本", "分镜", "出片"] },
];

/**
 * 首页小工具网格里摆的能力。
 * 从常量现算而不是手写一张表：场景卡和主推大卡上已经露过面的一律排掉，
 * 「一个区在首页最多出现一次」这条规则就永远不会因为谁忘了同步而破。
 * 步骤收编进项目详情页后，剩下的工具一屏放得下，不再分「推荐 / 全部」两档。
 */
const HOME_SHOWN = new Set<AreaId>([...HOME_SCENES, ...HOME_FEATURED.map((item) => item.id)]);
export const HOME_TOOL_AREAS: AreaId[] = TOOL_AREAS.filter((id) => !HOME_SHOWN.has(id));
