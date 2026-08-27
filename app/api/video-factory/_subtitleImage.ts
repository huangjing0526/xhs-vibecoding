import React from "react";
import satori from "satori";
import { SUBTITLE_FONT_FAMILY, loadSubtitleFont } from "@/app/api/video-factory/_fonts";
import { layoutSubtitle } from "@/lib/videoFactory";

/**
 * 把一句字幕渲成一张透明 PNG，交给 ffmpeg 叠到画面上。
 *
 * 为什么不用 ffmpeg 自己画字：本机这份 ffmpeg 是精简编译，
 * drawtext 和 subtitles 两个滤镜都没有（只有 overlay）。
 * 而 satori + resvg 是工程里现成的（封面路由在用），中文和 ①②③ 都渲得出来。
 */

// 动态加载 resvg-wasm，避免 webpack 静态解析 .wasm
let resvgModule: typeof import("@resvg/resvg-wasm") | null = null;
async function getResvg() {
  if (resvgModule) return resvgModule;
  const mod = await import("@resvg/resvg-wasm");
  try {
    // 从 node_modules 直接读 wasm。
    // 试过的两条路都不行：new URL(裸包名, import.meta.url) 会被当成相对路径解析；
    // createRequire 经 webpack 打包后不再是函数。本机工具按 cwd 找最省事，
    // 而且 .local 那些路径本来就是这么算的，写法一致。
    const { readFile } = await import("node:fs/promises");
    const nodePath = await import("node:path");
    const wasmPath = nodePath.join(process.cwd(), "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm");
    await mod.initWasm(await readFile(wasmPath));
  } catch (error) {
    // 只有「重复初始化」可以放过；其余必须抛出去，
    // 吞掉它的结果是渲染时冒出一句没头没尾的 "Wasm has not been initialized"
    const message = error instanceof Error ? error.message : String(error);
    if (!/already initialized/i.test(message)) throw error;
  }
  resvgModule = mod;
  return mod;
}

export interface SubtitleImageOptions {
  width: number;
  height: number;
  /** 字幕条底边距画面底部多远，按画面高度的比例算 */
  bottomRatio?: number;
}

/**
 * 做成「条」而不是描边字：satori 对文字描边的支持不确定，
 * 而半透明底衬本来就是中文短视频最常见的字幕样式，两个问题一起解决。
 */
export async function renderSubtitlePng(
  text: string,
  options: SubtitleImageOptions,
): Promise<Buffer> {
  const { width, height } = options;
  const bottomRatio = options.bottomRatio ?? 0.14;
  const { lines, fontSize } = layoutSubtitle(text, { width });
  const font = await loadSubtitleFont();

  const element = React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
        width,
        height,
        paddingBottom: Math.round(height * bottomRatio),
      },
    },
    lines.map((line, index) =>
      React.createElement(
        "div",
        {
          key: index,
          style: {
            display: "flex",
            backgroundColor: "rgba(0,0,0,0.58)",
            color: "#ffffff",
            fontSize,
            fontWeight: 700,
            fontFamily: SUBTITLE_FONT_FAMILY,
            lineHeight: 1.32,
            padding: `${Math.round(fontSize * 0.16)}px ${Math.round(fontSize * 0.42)}px`,
            borderRadius: Math.round(fontSize * 0.22),
            // 两行之间留一点缝，两条底衬才不会糊成一块
            marginTop: index === 0 ? 0 : Math.round(fontSize * 0.14),
          },
        },
        line,
      ),
    ),
  );

  const svg = await satori(element, {
    width,
    height,
    fonts: [{ name: SUBTITLE_FONT_FAMILY, data: font, weight: 700, style: "normal" }],
  });

  const { Resvg } = await getResvg();
  // 背景留空，叠加时只覆盖字幕条那一块
  const resvg = new Resvg(svg, { fitTo: { mode: "width" as const, value: width }, background: "rgba(0,0,0,0)" });
  return Buffer.from(resvg.render().asPng());
}
