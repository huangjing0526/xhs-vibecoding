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
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * 全站能力目录的单一事实源。
 * 侧栏图标轨、首页卡片、工具目录、命令面板、页头标题全部从这里派生——
 * 新增一个区只改这一个文件，杜绝「导航标签 ≠ 页头标题 ≠ 首页卡片文案」的三处漂移。
 */

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
  | "video"
  | "videoFactory"
  | "quality"
  | "review"
  | "rewrite"
  | "blogger"
  | "extract"
  | "watermark";

/** 工具目录的分区，数组顺序即分类 tab 与页面分区的先后。 */
export type ToolCategory = "写笔记" | "做图" | "做视频" | "优化与复盘";
export const TOOL_CATEGORY_ORDER: ToolCategory[] = ["写笔记", "做图", "做视频", "优化与复盘"];

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
  /** 进来前必须先选一篇笔记；目录卡与意图路由据此提示。 */
  needsNote?: boolean;
}

export const AREAS: Record<AreaId, AreaDef> = {
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
    hint: "内置出图模板",
    subtitle: "挑一个模板直接开做，会带着它进图片工厂。",
    icon: Shapes,
    tint: "from-soft",
  },
  projects: {
    label: "项目",
    hint: "所有笔记",
    subtitle: "每条选题就是一篇笔记，点进去从选题写到发布。",
    icon: FolderOpen,
    tint: "from-brand-50",
  },
  note: {
    label: "笔记",
    hint: "选题到发布",
    subtitle: "选一篇笔记，从选题到发布一条龙。",
    icon: PenLine,
    tint: "from-brand-50",
  },
  library: {
    label: "素材库",
    hint: "攒料 · 出选题",
    subtitle: "攒料、提炼、导入——所有选题的来源。",
    icon: Inbox,
    category: "写笔记",
    tint: "from-brand-50",
  },
  assets: {
    label: "资产库",
    hint: "模特 · 产品 · 场景",
    subtitle: "反复要用的模特、产品与场景参考图，存在本机，生成时随时取。",
    icon: Library,
    category: "做图",
    tint: "from-soft",
  },
  works: {
    label: "作品",
    hint: "跑出来的图",
    subtitle: "本机跑出来的全部产出，按模板翻，好用的存进资产库反复用。",
    icon: Sparkles,
    category: "做图",
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
  video: {
    label: "视频脚本",
    hint: "口播 · 分镜",
    subtitle: "把笔记转成口播 / 分镜视频脚本。",
    icon: Clapperboard,
    category: "做视频",
    tint: "from-sunken",
    needsNote: true,
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
    hint: "扒结构 · 出脚本",
    subtitle: "粘抖音/小红书链接，提取视频 + 口播脚本并拆解结构。",
    icon: Scissors,
    category: "做视频",
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
    category: "优化与复盘",
    tint: "from-brand-100",
    needsNote: true,
  },
  blogger: {
    label: "对标拆解",
    hint: "拆博主 · 沉道库",
    subtitle: "拆解对标博主，沉淀可复用的道库。",
    icon: Radar,
    category: "优化与复盘",
    tint: "from-brand-100",
  },
  quality: {
    label: "发布检查",
    hint: "质检 · 发布",
    subtitle: "发布前规则质检与兜底修复。",
    icon: ShieldCheck,
    category: "优化与复盘",
    tint: "from-brand-100",
    needsNote: true,
  },
  review: {
    label: "数据复盘",
    hint: "看数据 · 拿建议",
    subtitle: "已发布笔记的数据表现与改进建议。",
    icon: BarChart3,
    category: "优化与复盘",
    tint: "from-brand-100",
  },
};

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

/** 左侧图标轨。「创建」是动作不是区，单独由外壳处理，不进这个列表。 */
export const RAIL_AREAS: AreaId[] = ["home", "tools", "templates", "projects", "library", "assets", "works"];

/**
 * 直接坐在画布上的页：自己排版式，不套那张浮起的白面板。
 * 与「有没有 category」不是同一回事——笔记详情页同样没有 category，但要白面板。
 */
export const PLAIN_AREAS: AreaId[] = ["home", "tools", "templates", "projects", "library", "assets", "works"];

/** ⌘K 可跳转的区：侧栏大类 + 全部能力。笔记详情页要先选一篇，不在其中。 */
export const COMMAND_AREAS: AreaId[] = Array.from(new Set<AreaId>([...RAIL_AREAS, ...TOOL_AREAS]));

/** 首页场景卡：覆盖六种最常见的开工方式，一行摆得下。 */
export const HOME_SCENES: AreaId[] = ["projects", "images", "videoFactory", "blogger", "extract", "review"];

/** 首页两张主推大卡：一条完整流水线一张，写清中间几步，避免「点进去才知道要干嘛」。 */
export const HOME_FEATURED: Array<{ id: AreaId; title: string; desc: string; steps: string[] }> = [
  { id: "library", title: "一键成篇", desc: "攒的料直接变成能发的笔记", steps: ["素材", "选题", "草稿", "封面"] },
  { id: "videoFactory", title: "爆款视频", desc: "借对标结构，用自己的素材出片", steps: ["对标", "脚本", "分镜", "出片"] },
];

/** 首页小工具网格：只放真实存在的能力，不摆没做的。 */
export const HOME_TOOLS: AreaId[] = ["images", "assets", "extract", "rewrite", "video", "quality"];
