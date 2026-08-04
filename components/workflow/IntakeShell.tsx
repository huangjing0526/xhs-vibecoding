import type { ReactNode } from "react";
import CollapsiblePanel from "@/components/ui/CollapsiblePanel";

interface IntakeShellProps {
  title: string;
  /** 右侧一句话说明 */
  hint?: string;
  /** 进入 tab 组时为 true：去掉折叠卡外壳，只吐内容，由外层容器提供卡片边界。 */
  headless?: boolean;
  children: ReactNode;
}

/** 录入类面板的外壳：独立使用时是可折叠卡片，进入 tab 组时（headless）只渲染内容。 */
export default function IntakeShell({ title, hint, headless = false, children }: IntakeShellProps) {
  if (headless) return <>{children}</>;
  return (
    <CollapsiblePanel title={title} hint={hint}>
      {children}
    </CollapsiblePanel>
  );
}
