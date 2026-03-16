import type { Config } from "tailwindcss";

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
        xhs: {
          red: "#ff2442",
          pink: "#fe2c55",
          orange: "#ff6b35",
        },
      },
    },
  },
  plugins: [],
};
export default config;
