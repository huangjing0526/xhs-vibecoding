export type CoverTemplateId = "command" | "alert" | "checklist" | "casefile" | "contrast" | "sticky";

export interface CoverConfig {
  templateId?: CoverTemplateId;
  sourceKey?: string;
  backgroundImage?: string;
  backgroundColor: string;
  overlayColor: string;
  overlayOpacity: number;
  overlayBlur: number;
  accentColor?: string;
  secondaryColor?: string;
  title: string;
  subtitle?: string;
  dayNumber?: number;
  titleSize: number;
  titleColor: string;
  subtitleColor?: string;
  titlePosition: "center" | "left" | "bottom";
  fontFamily: string;
}

export interface CoverTemplateDefinition {
  id: CoverTemplateId;
  name: string;
  description: string;
  previewTone: string;
  config: Pick<
    CoverConfig,
    | "templateId"
    | "backgroundColor"
    | "overlayColor"
    | "overlayOpacity"
    | "overlayBlur"
    | "accentColor"
    | "secondaryColor"
    | "titleSize"
    | "titleColor"
    | "subtitleColor"
    | "titlePosition"
    | "fontFamily"
  >;
}

const SANS_FONT = '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif';
const MONO_FONT = '"SFMono-Regular", Menlo, Monaco, Consolas, monospace';

export const COVER_TEMPLATES: CoverTemplateDefinition[] = [
  {
    id: "command",
    name: "命令行黑底",
    description: "AI Coding、开发复盘、技术感强",
    previewTone: "黑底 / 代码感",
    config: {
      templateId: "command",
      backgroundColor: "#101214",
      overlayColor: "#0f172a",
      overlayOpacity: 0.06,
      overlayBlur: 0,
      accentColor: "#34d399",
      secondaryColor: "#f8fafc",
      titleSize: 92,
      titleColor: "#f8fafc",
      subtitleColor: "#a7f3d0",
      titlePosition: "left",
      fontFamily: MONO_FONT,
    },
  },
  {
    id: "alert",
    name: "痛点警示",
    description: "问题、踩坑、返工、低效场景",
    previewTone: "红白 / 强痛点",
    config: {
      templateId: "alert",
      backgroundColor: "#fff7f7",
      overlayColor: "#ef4444",
      overlayOpacity: 0.04,
      overlayBlur: 0,
      accentColor: "#e11d48",
      secondaryColor: "#111827",
      titleSize: 96,
      titleColor: "#111827",
      subtitleColor: "#be123c",
      titlePosition: "center",
      fontFamily: SANS_FONT,
    },
  },
  {
    id: "checklist",
    name: "清单收藏",
    description: "步骤、Prompt、模板、SOP",
    previewTone: "白底 / 收藏感",
    config: {
      templateId: "checklist",
      backgroundColor: "#f8fafc",
      overlayColor: "#14b8a6",
      overlayOpacity: 0.04,
      overlayBlur: 0,
      accentColor: "#0f766e",
      secondaryColor: "#0f172a",
      titleSize: 88,
      titleColor: "#0f172a",
      subtitleColor: "#0f766e",
      titlePosition: "left",
      fontFamily: SANS_FONT,
    },
  },
  {
    id: "casefile",
    name: "项目档案",
    description: "真实案例、日报复盘、项目记录",
    previewTone: "档案纸 / 案例感",
    config: {
      templateId: "casefile",
      backgroundColor: "#f4efe6",
      overlayColor: "#a16207",
      overlayOpacity: 0.03,
      overlayBlur: 0,
      accentColor: "#1f2937",
      secondaryColor: "#b45309",
      titleSize: 86,
      titleColor: "#1c1917",
      subtitleColor: "#92400e",
      titlePosition: "left",
      fontFamily: SANS_FONT,
    },
  },
  {
    id: "contrast",
    name: "反差对比",
    description: "别急着、不一定、误区纠正",
    previewTone: "黑黄 / 观点反差",
    config: {
      templateId: "contrast",
      backgroundColor: "#111111",
      overlayColor: "#f59e0b",
      overlayOpacity: 0,
      overlayBlur: 0,
      accentColor: "#fbbf24",
      secondaryColor: "#ffffff",
      titleSize: 94,
      titleColor: "#ffffff",
      subtitleColor: "#fef3c7",
      titlePosition: "center",
      fontFamily: SANS_FONT,
    },
  },
  {
    id: "sticky",
    name: "便签模板",
    description: "方法沉淀、Prompt、轻量技巧",
    previewTone: "便签 / 可复用",
    config: {
      templateId: "sticky",
      backgroundColor: "#fff3bf",
      overlayColor: "#f59e0b",
      overlayOpacity: 0.05,
      overlayBlur: 0,
      accentColor: "#d97706",
      secondaryColor: "#422006",
      titleSize: 86,
      titleColor: "#422006",
      subtitleColor: "#92400e",
      titlePosition: "center",
      fontFamily: SANS_FONT,
    },
  },
];

export const DEFAULT_COVER_CONFIG: CoverConfig = {
  ...COVER_TEMPLATES[0].config,
  title: "Vibecoding\nDay 1",
  subtitle: "#AI编程 #VibeCoding",
};

export const COLOR_PRESETS = COVER_TEMPLATES.map((template) => ({
  name: template.name,
  bg: template.config.backgroundColor,
  overlay: template.config.overlayColor,
}));

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

export function getCoverTemplate(id?: CoverTemplateId): CoverTemplateDefinition {
  return COVER_TEMPLATES.find((template) => template.id === id) || COVER_TEMPLATES[0];
}

export async function generateCoverDataUrl(
  canvas: HTMLCanvasElement,
  config: CoverConfig
): Promise<string> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot get canvas context");

  const width = 1080;
  const height = 1440;
  canvas.width = width;
  canvas.height = height;

  if (config.backgroundImage) {
    await drawBackgroundImage(ctx, config.backgroundImage, width, height);
    drawOverlay(ctx, config, width, height);
  } else {
    drawTemplateBackground(ctx, config, width, height);
  }

  drawTemplateChrome(ctx, config, width, height);

  if (config.dayNumber) {
    drawDayBadge(ctx, config, width);
  }

  drawTitle(ctx, config, width, height);
  drawSubtitle(ctx, config, width, height);

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

function drawTemplateBackground(
  ctx: CanvasRenderingContext2D,
  config: CoverConfig,
  width: number,
  height: number
): void {
  const templateId = config.templateId || "command";
  ctx.fillStyle = config.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (templateId === "command") {
    drawGrid(ctx, width, height, "rgba(255,255,255,0.055)", 72);
    drawTerminalHeader(ctx, config, width);
  }

  if (templateId === "alert") {
    ctx.fillStyle = config.accentColor || "#e11d48";
    ctx.fillRect(0, 0, 44, height);
    ctx.fillStyle = "rgba(225,29,72,0.08)";
    ctx.fillRect(760, 0, 320, height);
    drawLargeLabel(ctx, "ISSUE", 760, 1210, "rgba(225,29,72,0.09)", 156);
  }

  if (templateId === "checklist") {
    ctx.fillStyle = "rgba(15,118,110,0.08)";
    ctx.fillRect(0, 0, 220, height);
    drawChecklistMarks(ctx, config, width, height);
  }

  if (templateId === "casefile") {
    ctx.strokeStyle = config.accentColor || "#1f2937";
    ctx.lineWidth = 6;
    ctx.strokeRect(54, 54, width - 108, height - 108);
    ctx.fillStyle = "#e7d8bf";
    ctx.fillRect(54, 54, 310, 92);
    drawLargeLabel(ctx, "CASE", 650, 1190, "rgba(120,53,15,0.12)", 170);
  }

  if (templateId === "contrast") {
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, width * 0.54, height);
    ctx.fillStyle = config.accentColor || "#fbbf24";
    ctx.fillRect(width * 0.54, 0, width * 0.46, height);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(width * 0.54 - 12, 0, 24, height);
  }

  if (templateId === "sticky") {
    drawGrid(ctx, width, height, "rgba(120,53,15,0.08)", 52);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(126, 72, 286, 58);
    ctx.fillRect(710, 80, 228, 52);
  }

  drawOverlay(ctx, config, width, height);
}

function drawOverlay(ctx: CanvasRenderingContext2D, config: CoverConfig, width: number, height: number): void {
  if (config.overlayOpacity <= 0) return;
  ctx.fillStyle = hexToRgba(config.overlayColor, config.overlayOpacity);
  ctx.fillRect(0, 0, width, height);
}

function drawTemplateChrome(
  ctx: CanvasRenderingContext2D,
  config: CoverConfig,
  width: number,
  height: number
): void {
  const templateId = config.templateId || "command";
  const accent = config.accentColor || "#ef4444";
  const secondary = config.secondaryColor || config.titleColor;

  ctx.save();
  if (templateId === "command") {
    drawPill(ctx, "$ vibe-note run", 72, 132, accent, "#101214", MONO_FONT);
    drawPill(ctx, "AI CODING LOG", 72, height - 150, "rgba(255,255,255,0.14)", "#f8fafc", MONO_FONT);
  }

  if (templateId === "alert") {
    drawPill(ctx, "问题记录", 94, 118, accent, "#ffffff", SANS_FONT);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(124, 330);
    ctx.lineTo(width - 124, 330);
    ctx.stroke();
  }

  if (templateId === "checklist") {
    drawPill(ctx, "可收藏清单", 92, 118, accent, "#ffffff", SANS_FONT);
    ctx.fillStyle = accent;
    ctx.fillRect(92, height - 210, width - 184, 8);
  }

  if (templateId === "casefile") {
    drawPill(ctx, "开发复盘档案", 92, 102, secondary, "#f4efe6", SANS_FONT);
    ctx.fillStyle = secondary;
    ctx.fillRect(92, 226, 180, 10);
  }

  if (templateId === "contrast") {
    drawPill(ctx, "误区纠正", 80, 118, "#ffffff", "#111111", SANS_FONT);
    drawPill(ctx, "正确做法", width - 300, height - 150, "#111111", "#fbbf24", SANS_FONT);
  }

  if (templateId === "sticky") {
    drawPill(ctx, "可复用模板", 92, 142, accent, "#fff7ed", SANS_FONT);
    ctx.strokeStyle = hexToRgba(accent, 0.42);
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 16]);
    ctx.strokeRect(84, 214, width - 168, height - 404);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  gap: number
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += gap) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTerminalHeader(ctx: CanvasRenderingContext2D, config: CoverConfig, width: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(54, 54, width - 108, 84);
  ["#ef4444", "#f59e0b", "#22c55e"].forEach((color, index) => {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(104 + index * 38, 96, 13, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = config.accentColor || "#34d399";
  ctx.font = `700 26px ${MONO_FONT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText("xhs-cover.sh", width - 92, 96);
  ctx.restore();
}

function drawChecklistMarks(
  ctx: CanvasRenderingContext2D,
  config: CoverConfig,
  width: number,
  height: number
): void {
  ctx.save();
  const accent = config.accentColor || "#0f766e";
  for (let index = 0; index < 5; index += 1) {
    const y = 865 + index * 74;
    ctx.strokeStyle = hexToRgba(accent, index < 3 ? 0.55 : 0.2);
    ctx.lineWidth = 5;
    ctx.strokeRect(92, y, 34, 34);
    ctx.beginPath();
    ctx.moveTo(102, y + 18);
    ctx.lineTo(113, y + 29);
    ctx.lineTo(144, y - 3);
    ctx.stroke();
    ctx.fillStyle = `rgba(15,23,42,${index < 3 ? 0.22 : 0.1})`;
    ctx.fillRect(166, y + 7, width - 290, 12);
  }
  ctx.restore();
}

function drawLargeLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = color;
  ctx.font = `900 ${size}px ${SANS_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  background: string,
  color: string,
  fontFamily: string
): void {
  ctx.save();
  ctx.font = `800 30px ${fontFamily}`;
  const width = ctx.measureText(text).width + 46;
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(x, y, width, 58, 12);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 23, y + 30);
  ctx.restore();
}

function drawDayBadge(ctx: CanvasRenderingContext2D, config: CoverConfig, width: number): void {
  const padding = 54;
  const badgeWidth = 132;
  const badgeHeight = 104;
  const x = width - padding - badgeWidth;
  const y = padding;

  ctx.save();
  ctx.fillStyle = hexToRgba(config.accentColor || "#ffffff", 0.22);
  ctx.beginPath();
  ctx.roundRect(x, y, badgeWidth, badgeHeight, 18);
  ctx.fill();

  ctx.fillStyle = config.subtitleColor || config.titleColor;
  ctx.font = `800 22px ${SANS_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("DAY", x + badgeWidth / 2, y + 34);

  ctx.font = `900 40px ${SANS_FONT}`;
  ctx.fillText(String(config.dayNumber), x + badgeWidth / 2, y + 72);
  ctx.restore();
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  config: CoverConfig,
  width: number,
  height: number
): void {
  const templateId = config.templateId || "command";
  const maxWidth = config.titlePosition === "left" ? width - 176 : width - 148;
  let fontSize = config.titleSize;
  let lines: string[] = [];
  let lineHeight = fontSize * 1.16;
  let totalHeight = 0;

  while (fontSize >= 44) {
    ctx.font = `900 ${fontSize}px ${config.fontFamily}`;
    lines = wrapText(ctx, config.title, maxWidth);
    lineHeight = fontSize * (templateId === "command" ? 1.18 : 1.12);
    totalHeight = lines.length * lineHeight;
    if (totalHeight <= height * 0.52) break;
    fontSize -= 4;
  }

  const textAlign = config.titlePosition === "left" ? "left" : "center";
  const x = textAlign === "left" ? 92 : width / 2;
  const startY = getTitleStartY(config, height, totalHeight);
  const shouldShadow = templateId === "command" || templateId === "contrast";

  ctx.save();
  ctx.fillStyle = config.titleColor;
  ctx.font = `900 ${fontSize}px ${config.fontFamily}`;
  ctx.textAlign = textAlign;
  ctx.textBaseline = "middle";

  lines.forEach((line, index) => {
    const y = startY + index * lineHeight + lineHeight / 2;
    if (shouldShadow) {
      ctx.shadowColor = "rgba(0,0,0,0.38)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 6;
    }
    ctx.fillText(line, x, y);
  });
  ctx.restore();
}

function getTitleStartY(config: CoverConfig, height: number, totalHeight: number): number {
  if (config.titlePosition === "bottom") return height - 365 - totalHeight;
  if (config.titlePosition === "left") return 420;
  return height / 2 - totalHeight / 2 - 30;
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  config: CoverConfig,
  width: number,
  height: number
): void {
  if (!config.subtitle) return;

  const templateId = config.templateId || "command";
  const textAlign = config.titlePosition === "left" ? "left" : "center";
  const x = textAlign === "left" ? 94 : width / 2;
  const y =
    templateId === "command"
      ? height - 232
      : templateId === "contrast"
        ? height - 245
        : config.titlePosition === "bottom"
          ? height - 180
          : height - 180;

  ctx.save();
  ctx.fillStyle = config.subtitleColor || hexToRgba(config.titleColor, 0.82);
  ctx.font = `800 ${Math.max(30, Math.round(config.titleSize * 0.34))}px ${config.fontFamily}`;
  ctx.textAlign = textAlign;
  ctx.textBaseline = "middle";
  ctx.fillText(config.subtitle, x, y, width - 180);
  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const manualLines = text.split("\n");

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

  return lines.length > 0 ? lines : ["封面标题"];
}

function hexToRgba(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
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
