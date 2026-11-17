import { NextResponse, type NextRequest } from "next/server";
import { DESKTOP_VIEW, VIEW_COOKIE } from "@/lib/mobile/viewMode";

// iPad 从 iOS 13 起报桌面 UA，落到桌面工作台是对的——平板放得下侧栏。
const MOBILE_UA = /Android|iPhone|iPod|Windows Phone|BlackBerry|webOS|Opera Mini|IEMobile/i;

/** 手机访问首页时分流到移动版；用户手动切过桌面版的除外。 */
export function middleware(req: NextRequest) {
  if (req.cookies.get(VIEW_COOKIE)?.value === DESKTOP_VIEW) return NextResponse.next();
  if (!MOBILE_UA.test(req.headers.get("user-agent") || "")) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/m";
  return NextResponse.redirect(url);
}

export const config = { matcher: "/" };
