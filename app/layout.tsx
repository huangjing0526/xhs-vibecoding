import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeNote - 你的爆款笔记",
  description: "AI 一键生成小红书爆款笔记 - 封面图+文案+标签",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            className: "!rounded-2xl !border !border-line !font-semibold !shadow-raised",
          }}
        />
      </body>
    </html>
  );
}
