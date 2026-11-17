import type { LucideIcon } from "lucide-react";
import { Wand2 } from "lucide-react";
import type { AreaId as WorkbenchAreaId } from "@/lib/capabilities";

/**
 * 移动端能力宫格的单一事实源：图标格、二级页路由都从这里派生。
 *
 * 大部分能力与桌面侧栏一一对应，所以带 areaId、图标直接复用 NavIcon——两端说的是同一件事。
 * 移动端独有的能力（如一键出片）没有对应的桌面区，自带 icon。
 *
 * 手机上跑不动的那些没有 href，原因写在 hint 里，不假装能用：多栏表格/本地目录类
 * （素材库、对标拆解…）在小屏没法操作；去水印依赖本机 GPU 服务。
 */
export interface MobileTool {
  id: string;
  /** 对应的桌面能力；移动端独有能力为 null */
  areaId: WorkbenchAreaId | null;
  /** areaId 为 null 时的图标 */
  icon?: LucideIcon;
  label: string;
  hint: string;
  /** null = 只在桌面端提供，点击引导切换视图 */
  href: string | null;
  /** 宫格里挂「推荐」角标 */
  featured?: boolean;
}

export const MOBILE_TOOLS: MobileTool[] = [
  { id: "clip", areaId: null, icon: Wand2, label: "一键出片", hint: "传图 + 脚本出视频", href: "/m/t/clip", featured: true },
  { id: "extract", areaId: "extract", label: "链接拆片", hint: "粘链接 · 出脚本", href: "/m/t/extract", featured: true },
  { id: "cover", areaId: "textLayer", label: "封面配图", hint: "封面 · 内容图", href: "/m/t/cover", featured: true },
  { id: "video", areaId: "video", label: "视频脚本", hint: "口播 · 分镜", href: "/m/t/video" },
  { id: "templates", areaId: "templateStudio", label: "模板出图", hint: "选模板直接出", href: "/m/create" },
  { id: "workbench", areaId: "projects", label: "我的笔记", hint: "草稿 · 状态", href: "/m/works" },
  { id: "review", areaId: "review", label: "数据复盘", hint: "看已发表现", href: "/m/works" },
  { id: "library", areaId: "library", label: "素材库", hint: "整理素材要大屏", href: null },
  { id: "blogger", areaId: "blogger", label: "对标拆解", hint: "采集表格要大屏", href: null },
  { id: "rewrite", areaId: "rewrite", label: "爆款优化", hint: "对照改写要大屏", href: null },
  { id: "quality", areaId: "quality", label: "发布检查", hint: "逐条修订要大屏", href: null },
  { id: "watermark", areaId: "watermark", label: "视频去水印", hint: "依赖本机 GPU 服务", href: null },
];

export const DESKTOP_ONLY_TOOLS = MOBILE_TOOLS.filter((tool) => !tool.href);
