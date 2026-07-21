import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsiblePanelProps {
  title: string;
  /** 右侧一句话说明这个面板是干什么的 */
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** 按需展开的次级面板：录入、导入这类「用得到但不常用」的能力统一收在这里。 */
export default function CollapsiblePanel({ title, hint, defaultOpen = false, children }: CollapsiblePanelProps) {
  return (
    <details open={defaultOpen} className="group overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-soft">
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-ink">{title}</div>
          {hint && <div className="mt-1 truncate text-xs text-faint">{hint}</div>}
        </div>
        <ChevronDown size={16} className="shrink-0 text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}
