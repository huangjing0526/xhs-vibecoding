"use client";

import NavIcon from "@/components/workflow/NavIcon";
import type { MobileTool } from "@/lib/mobile/tools";

/**
 * 能力图标：对齐桌面能力的走 NavIcon（两端同一个能力用同一个图标），
 * 移动端独有的用自带 icon。分支只在这里出现一次，宫格和「我的」都用它。
 */
export default function ToolIcon({ tool, size = 21 }: { tool: MobileTool; size?: number }) {
  if (tool.areaId) return <NavIcon id={tool.areaId} size={size} />;

  const Icon = tool.icon;
  return Icon ? <Icon size={size} strokeWidth={1.9} aria-hidden="true" /> : null;
}
