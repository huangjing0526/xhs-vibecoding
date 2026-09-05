import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FACTORY_ROOT } from "@/app/api/video-factory/_shared";

/**
 * 字幕用的中文字体。
 *
 * 封面路由每次生成都现拉一遍 Google Fonts，那是单张图、可以忍；
 * 字幕一条片子要渲 5~12 张，每张都拉十兆不合理，而且本机工具不该把外网当运行时依赖。
 * 所以首次拉下来就落盘，之后完全离线。
 */

// Noto Sans SC。实测这一份含 30890 个字形，①②③ 这类带圈数字也在里面——
// 分镜的编号法则全靠它们，换字体前先确认字形覆盖。
const FONT_URL =
  "https://fonts.gstatic.com/s/notosanssc/v36/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG9_FnYxNbPzS5HE.ttf";
const FONT_DIR = path.join(FACTORY_ROOT, "fonts");
const FONT_FILE = path.join(FONT_DIR, "noto-sans-sc.ttf");

/** 同一个进程里只读一次盘。 */
let cached: Buffer | null = null;

export const SUBTITLE_FONT_FAMILY = "Noto Sans SC";

export async function loadSubtitleFont(): Promise<Buffer> {
  if (cached) return cached;

  const onDisk = await readFile(FONT_FILE).catch(() => null);
  if (onDisk && onDisk.byteLength > 0) {
    cached = onDisk;
    return cached;
  }

  const response = await fetch(FONT_URL);
  if (!response.ok) {
    throw new Error(`字体下载失败（${response.status}），首次合成需要联网拉一次字幕字体`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(FONT_DIR, { recursive: true });
  await writeFile(FONT_FILE, bytes);
  console.info("[VideoFactory] 字幕字体已缓存到本机", {
    action: "videoFactory.font.cache",
    path: FONT_FILE,
    bytes: bytes.byteLength,
  });
  cached = bytes;
  return cached;
}
