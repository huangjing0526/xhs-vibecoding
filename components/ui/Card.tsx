import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  /** flush=不带内边距，交给调用方自己排（列表卡、含表格的卡用它） */
  flush?: boolean;
  /** 悬停时轻微抬起，用于可点击的卡 */
  interactive?: boolean;
  className?: string;
}

/** 圆角白卡：全站唯一的「一块内容」容器，浮在 canvas 上，靠阴影而非硬边框分层。 */
export default function Card({ children, flush = false, interactive = false, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-3xl border border-line bg-surface shadow-card ${flush ? "" : "p-5"} ${
        interactive ? "transition-shadow duration-200 hover:shadow-raised" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** flush 卡内使用时补回左右内边距 */
  padded?: boolean;
}

/** 卡片头：标题 + 一行说明 + 右侧动作，三者位置全站固定。 */
export function CardHeader({ title, description, action, padded = false }: CardHeaderProps) {
  return (
    <div
      className={`flex items-start justify-between gap-3 ${
        padded ? "border-b border-line px-5 py-4" : "mb-4"
      }`}
    >
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold leading-tight text-ink">{title}</h3>
        {description && <p className="mt-1 text-xs leading-5 text-faint">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
