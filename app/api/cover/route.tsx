import { NextRequest, NextResponse } from "next/server";
import satori from "satori";
import React from "react";

// 动态加载 resvg-wasm，避免 webpack 解析 .wasm 文件
let resvgModule: any = null;
async function getResvg() {
  if (resvgModule) return resvgModule;
  const mod = await import("@resvg/resvg-wasm");
  try {
    // 从 npm 包的 URL 加载 WASM（Cloudflare 兼容）
    const wasmUrl = new URL("@resvg/resvg-wasm/index_bg.wasm", import.meta.url);
    const wasmResponse = await fetch(wasmUrl);
    await mod.initWasm(wasmResponse);
  } catch (e: any) {
    if (!e.message?.includes("Already initialized")) throw e;
  }
  resvgModule = mod;
  return mod;
}

// 尝试从 Google Fonts 加载字体
let fontData: ArrayBuffer | null = null;

async function loadFont(): Promise<ArrayBuffer> {
  if (fontData) return fontData;

  try {
    const response = await fetch(
      "https://fonts.gstatic.com/s/notosanssc/v36/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG9_FnYxNbPzS5HE.ttf"
    );
    fontData = await response.arrayBuffer();
    return fontData;
  } catch (error) {
    console.error("Failed to load font:", error);
    throw new Error("Font loading failed");
  }
}

interface CoverParams {
  title: string;
  subtitle?: string;
  dayNumber?: number;
  backgroundColor: string;
  overlayColor: string;
  overlayOpacity: number;
  titleColor: string;
  titleSize: number;
  titlePosition: "center" | "left" | "bottom";
}

export async function POST(request: NextRequest) {
  try {
    const params: CoverParams = await request.json();

    const { Resvg } = await getResvg();
    const font = await loadFont();

    const element = React.createElement(CoverComponent, params);

    // 小红书封面比例 3:4 (竖版)
    const svg = await satori(element, {
      width: 1080,
      height: 1440,
      fonts: [
        {
          name: "Noto Sans SC",
          data: font,
          weight: 700,
          style: "normal",
        },
      ],
    });

    // 转换为PNG
    const resvg = new Resvg(svg, {
      fitTo: {
        mode: "width" as const,
        value: 1080,
      },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    return new NextResponse(pngBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    console.error("Cover generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate cover" },
      { status: 500 }
    );
  }
}

function CoverComponent(props: CoverParams) {
  const {
    title,
    subtitle,
    dayNumber,
    backgroundColor,
    overlayColor,
    overlayOpacity,
    titleColor,
    titleSize,
    titlePosition,
  } = props;

  const getTitleStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      fontSize: titleSize,
      fontWeight: 700,
      color: titleColor,
      textShadow: "2px 2px 8px rgba(0,0,0,0.5)",
      maxWidth: "90%",
      textAlign: "center" as const,
      lineHeight: 1.3,
      wordBreak: "break-word" as const,
    };

    switch (titlePosition) {
      case "left":
        return { ...base, textAlign: "left" as const };
      case "bottom":
        return { ...base, marginTop: "auto", marginBottom: 100 };
      default:
        return base;
    }
  };

  const getContainerStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      padding: 60,
    };

    switch (titlePosition) {
      case "left":
        return { ...base, alignItems: "flex-start" };
      case "bottom":
        return { ...base, justifyContent: "flex-end" };
      default:
        return base;
    }
  };

  return React.createElement(
    "div",
    {
      style: {
        width: 1080,
        height: 1440,
        display: "flex",
        position: "relative" as const,
        backgroundColor,
      },
    },
    // 蒙层
    React.createElement("div", {
      style: {
        position: "absolute" as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: overlayColor,
        opacity: overlayOpacity,
      },
    }),
    // Day 徽章
    dayNumber &&
      React.createElement(
        "div",
        {
          style: {
            position: "absolute" as const,
            top: 40,
            right: 40,
            width: 100,
            height: 100,
            backgroundColor: "rgba(255,255,255,0.2)",
            borderRadius: 16,
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
            justifyContent: "center",
          },
        },
        React.createElement(
          "span",
          {
            style: {
              fontSize: 24,
              fontWeight: 700,
              color: "#ffffff",
            },
          },
          "DAY"
        ),
        React.createElement(
          "span",
          {
            style: {
              fontSize: 36,
              fontWeight: 700,
              color: "#ffffff",
            },
          },
          dayNumber.toString()
        )
      ),
    // 内容区域
    React.createElement(
      "div",
      { style: getContainerStyle() },
      React.createElement("div", { style: getTitleStyle() }, title),
      subtitle &&
        React.createElement(
          "div",
          {
            style: {
              fontSize: titleSize * 0.4,
              color: "rgba(255,255,255,0.8)",
              marginTop: 20,
            },
          },
          subtitle
        )
    )
  );
}

// Edge runtime for Cloudflare compatibility