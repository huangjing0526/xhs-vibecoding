import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import MobileTabBar from "@/components/mobile/MobileTabBar";

export const metadata: Metadata = {
  title: "VibeNote 移动版",
  description: "手机上拆片、出脚本、出图",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 生成结果里有大量可点小卡，双击缩放会误触；宽度已按窄屏排过，不需要缩放
  maximumScale: 1,
  themeColor: "#F4F4F8",
};

/** 移动端外壳：内容区限宽居中（桌面浏览器打开 /m 时也不至于拉满），底部常驻 tab 栏。 */
export default function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[520px] bg-canvas text-ink">
      {/* 给底部 tab 栏留出高度，否则最后一屏内容会被盖住 */}
      <div className="pb-[calc(66px+env(safe-area-inset-bottom))]">{children}</div>
      <MobileTabBar />
    </div>
  );
}
