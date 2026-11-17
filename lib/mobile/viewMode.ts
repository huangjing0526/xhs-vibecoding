/**
 * 桌面 / 移动两套界面的分流开关。
 *
 * middleware 按 UA 把手机分到 /m，但「我在手机上就是想看完整工作台」是合理需求，
 * 所以留一个用户可控的逃生舱：种下这个 cookie 后分流失效。
 */
export const VIEW_COOKIE = "view";
export const DESKTOP_VIEW = "desktop";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** 切回桌面版：种 cookie 让 middleware 放行，然后回首页。 */
export function switchToDesktop(): void {
  document.cookie = `${VIEW_COOKIE}=${DESKTOP_VIEW}; path=/; max-age=${COOKIE_MAX_AGE}`;
  window.location.href = "/";
}

/** 清掉逃生舱，回到按 UA 分流的默认行为。 */
export function clearDesktopPreference(): void {
  document.cookie = `${VIEW_COOKIE}=; path=/; max-age=0`;
}
