import { toast } from "sonner";
import type { Notice } from "@/components/workflow/types";

/**
 * 面板上报的 Notice → toast。桌面端由 WorkflowDashboard 统一渲染，移动端没有那层外壳，
 * 但复用的面板仍然按 onNotice 约定上报，所以这里补上同一个出口。
 *
 * 模块级函数而非组件内闭包：复用面板会把 onNotice 放进 useEffect 依赖，标识必须稳定。
 */
export function showNotice(notice: Notice): void {
  if (notice.type === "error") {
    toast.error(notice.message);
    return;
  }
  if (notice.type === "success") {
    toast.success(notice.message);
    return;
  }
  toast.info(notice.message);
}
