import type { Config } from "tailwindcss";

/**
 * 设计 token 单一事实源。组件一律用语义名（bg-surface / text-muted / border-line），
 * 不再散落十六进制字面量——换主题只改这里。
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // 表面：画布最暗，卡片浮在其上；soft 用于卡片内的凹陷块
        canvas: "#F4F4F8",
        surface: "#FFFFFF",
        soft: "#F3F3F8",
        sunken: "#E9E9F1",
        // 文字三级
        ink: "#15151C",
        muted: "#5D5D6B",
        faint: "#95959F",
        // 描边两级
        line: "#E8E8EF",
        "line-strong": "#D6D6E1",
        // 品牌靛紫：500→400 组成主渐变，600 用于 hover
        brand: {
          50: "#F1F0FE",
          100: "#E5E3FD",
          200: "#CBC8FB",
          300: "#A9A4F8",
          400: "#8B5CF6",
          500: "#6366F1",
          600: "#5348E2",
          700: "#4238BE",
        },
        // 语义色
        ok: "#0E9A72",
        warn: "#B8790C",
        danger: "#E5484D",
        // 小红书红降级为「小红书发布」的平台语义色，不再承担主操作
        xhs: "#FF2442",
      },
      borderRadius: {
        "4xl": "28px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(20, 20, 45, 0.04), 0 2px 8px rgba(20, 20, 45, 0.05)",
        raised: "0 6px 22px rgba(20, 20, 45, 0.10)",
        brand: "0 6px 18px rgba(99, 102, 241, 0.30)",
        pop: "0 16px 48px rgba(20, 20, 45, 0.16)",
      },
      fontFamily: {
        // 圆体只给数字、徽标、指标——承接整体圆角语言，中文正文仍走系统黑体
        rounded: ["ui-rounded", '"SF Pro Rounded"', '"Hiragino Maru Gothic ProN"', "system-ui", "sans-serif"],
        mono: ["ui-monospace", '"SF Mono"', "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
