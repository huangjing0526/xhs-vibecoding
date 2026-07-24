import { BarChart3, Clapperboard, Eraser, Flame, Image, Inbox, PenLine, Radar, Scissors, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WorkbenchAreaId } from "@/components/workflow/WorkbenchShell";

/** 侧栏导航图标，按区 id 收敛——新增区时类型层会强制补图标。 */
const ICONS: Record<WorkbenchAreaId, LucideIcon> = {
  workbench: PenLine,
  library: Inbox,
  cover: Image,
  video: Clapperboard,
  quality: ShieldCheck,
  review: BarChart3,
  rewrite: Flame,
  blogger: Radar,
  extract: Scissors,
  watermark: Eraser,
};

export default function NavIcon({ id, size = 17 }: { id: WorkbenchAreaId; size?: number }) {
  const Icon = ICONS[id];
  return <Icon size={size} strokeWidth={1.9} aria-hidden="true" />;
}
