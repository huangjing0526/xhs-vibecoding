// 封面生成工具

export interface CoverConfig {
  backgroundImage?: string;
  backgroundColor: string;
  overlayColor: string;
  overlayOpacity: number;
  overlayBlur: number;
  title: string;
  subtitle?: string;
  dayNumber?: number;
  titleSize: number;
  titleColor: string;
  titlePosition: "center" | "left" | "bottom";
  fontFamily: string;
}

export const DEFAULT_COVER_CONFIG: CoverConfig = {
  backgroundColor: "#1a1a2e",
  overlayColor: "#000000",
  overlayOpacity: 0.4,
  overlayBlur: 0,
  title: "Vibecoding Day 1",
  titleSize: 64,
  titleColor: "#ffffff",
  titlePosition: "center",
  fontFamily: "sans-serif",
};

export const COLOR_PRESETS = [
  { name: "深蓝夜空", bg: "#1a1a2e", overlay: "#0f0f23" },
  { name: "渐变紫", bg: "#2d1b69", overlay: "#1a0f3c" },
  { name: "科技蓝", bg: "#0a192f", overlay: "#020c1b" },
  { name: "暖橙", bg: "#ff6b35", overlay: "#e55a2b" },
  { name: "小红书红", bg: "#ff2442", overlay: "#cc1d35" },
  { name: "清新绿", bg: "#00b894", overlay: "#00a383" },
  { name: "优雅黑", bg: "#2d3436", overlay: "#1e2324" },
  { name: "淡粉", bg: "#fd79a8", overlay: "#e84393" },
];

export const MOOD_COLORS: Record<string, { bg: string; overlay: string }> = {
  excited: { bg: "#ff6b35", overlay: "#e55a2b" },
  frustrated: { bg: "#2d3436", overlay: "#1e2324" },
  achievement: { bg: "#00b894", overlay: "#00a383" },
  curiosity: { bg: "#0984e3", overlay: "#0769b8" },
  neutral: { bg: "#1a1a2e", overlay: "#0f0f23" },
  struggle: { bg: "#6c5ce7", overlay: "#5849c4" },
};

export function getMoodColors(mood: string): { bg: string; overlay: string } {
  return MOOD_COLORS[mood] || MOOD_COLORS.neutral;
}

export async function generateCoverDataUrl(
  canvas: HTMLCanvasElement,
  config: CoverConfig
): Promise<string> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot get canvas context");

  // 小红书封面比例 3:4 (竖版)
  const width = 1080;
  const height = 1440;
  canvas.width = width;
  canvas.height = height;

  // 1. 绘制背景
  if (config.backgroundImage) {
    await drawBackgroundImage(ctx, config.backgroundImage, width, height);
  } else {
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  // 2. 绘制蒙层
  if (config.overlayOpacity > 0) {
    ctx.fillStyle = hexToRgba(config.overlayColor, config.overlayOpacity);
    ctx.fillRect(0, 0, width, height);
  }

  // 3. 绘制Day徽章
  if (config.dayNumber) {
    drawDayBadge(ctx, config.dayNumber, width);
  }

  // 4. 绘制标题
  drawTitle(ctx, config, width, height);

  // 5. 绘制副标题
  if (config.subtitle) {
    drawSubtitle(ctx, config, width, height);
  }

  return canvas.toDataURL("image/png", 1.0);
}

async function drawBackgroundImage(
  ctx: CanvasRenderingContext2D,
  imageUrl: string,
  width: number,
  height: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Cover fit
      const scale = Math.max(width / img.width, height / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const x = (width - scaledWidth) / 2;
      const y = (height - scaledHeight) / 2;
      ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
      resolve();
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

function drawDayBadge(
  ctx: CanvasRenderingContext2D,
  dayNumber: number,
  width: number
): void {
  const padding = 40;
  const badgeSize = 100;

  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.beginPath();
  ctx.roundRect(width - padding - badgeSize, padding, badgeSize, badgeSize, 16);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("DAY", width - padding - badgeSize / 2, padding + 35);

  ctx.font = "bold 36px sans-serif";
  ctx.fillText(
    dayNumber.toString(),
    width - padding - badgeSize / 2,
    padding + 70
  );
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  config: CoverConfig,
  width: number,
  height: number
): void {
  const maxWidth = width - 120;
  ctx.fillStyle = config.titleColor;
  ctx.font = `bold ${config.titleSize}px ${config.fontFamily}`;
  ctx.textBaseline = "middle";

  // 支持手动换行和自动换行
  const lines = wrapText(ctx, config.title, maxWidth);
  const lineHeight = config.titleSize * 1.3;
  const totalHeight = lines.length * lineHeight;

  let startY: number;
  let textAlign: CanvasTextAlign;

  switch (config.titlePosition) {
    case "left":
      startY = height / 2 - totalHeight / 2;
      textAlign = "left";
      ctx.textAlign = "left";
      break;
    case "bottom":
      startY = height - 150 - totalHeight;
      textAlign = "center";
      ctx.textAlign = "center";
      break;
    case "center":
    default:
      startY = height / 2 - totalHeight / 2;
      textAlign = "center";
      ctx.textAlign = "center";
  }

  lines.forEach((line, index) => {
    const x = textAlign === "left" ? 60 : width / 2;
    const y = startY + index * lineHeight + lineHeight / 2;

    // 文字阴影
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillText(line, x, y);

    // 重置阴影
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  });
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  config: CoverConfig,
  width: number,
  height: number
): void {
  if (!config.subtitle) return;

  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.font = `${config.titleSize * 0.4}px ${config.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const y =
    config.titlePosition === "bottom" ? height - 80 : height / 2 + config.titleSize;

  ctx.fillText(config.subtitle, width / 2, y);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];

  // 首先按照手动换行符分割
  const manualLines = text.split('\n');

  // 对每一行进行自动换行处理
  for (const manualLine of manualLines) {
    let currentLine = "";

    for (const char of manualLine) {
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function downloadCover(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
