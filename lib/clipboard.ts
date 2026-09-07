import { toast } from "sonner";

/**
 * 复制到剪贴板并提示结果。
 *
 * 视频脚本、复盘建议、发布包各自写过一份，成功文案各不相同、失败文案措辞还不一致。
 * 收成一处后成功文案仍由调用方定（那是各页面自己的语气），失败文案统一。
 *
 * 走 `onNotice` 之类父级通知渠道的页面不适用这个函数——它固定用 toast。
 */
export async function copyToClipboard(
  text: string,
  options: { successMessage: string; action: string }
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(options.successMessage);
    return true;
  } catch (error) {
    console.error("[clipboard] 复制失败", { action: options.action, error });
    toast.error("复制失败，请手动选择内容复制");
    return false;
  }
}
