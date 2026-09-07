import type { AspectId } from "./targets";
import type { ContentCard, DraftNote } from "./xhsWorkflow";
import { downloadFile } from "./download";

/** 以下三个上限同时写在 prompt 文案里，prompt 与代码必须读同一份，否则模型白写、渲染截断。 */
const NODE_TEXT_MAX_CHARS = 18;

/** 单条 callout 字数上限。原先 normalize 截 32、兜底另用 28，收成一份。 */
const CALLOUT_MAX_CHARS = 32;

/** 页脚把 callouts 拼成一段话、折成两行，多出来的既画不出也没有别的去处。 */
const MAX_CALLOUTS = 2;

export type ImageAssetKind = "cover" | "content";
export type ImageSourceType = "topic" | "draft" | "manual";
export type ContentImageTemplateType =
  | "flowchart"
  | "architecture"
  | "checklist"
  | "timeline"
  | "comparison"
  | "steps";

/**
 * 每种模板的画布只排得下这么多 block——各 draw* 一直按这个数 slice，只是散成了魔法数字。
 * 收成单一来源后，normalize 按模板容量截（不再平铺留 6），draw* 与 prompt 也读同一份，
 * 消除「模型写了第 5/6 条、steps 只画 4 条、多的永不渲染」的幽灵 block（见改造方案 Phase 3）。
 */
const TEMPLATE_BLOCK_CAPACITY: Record<ContentImageTemplateType, number> = {
  flowchart: 5,
  architecture: 6,
  checklist: 6,
  timeline: 5,
  comparison: 6,
  steps: 4,
};

export interface ImageWorkflowSourceInput {
  sourceType: ImageSourceType;
  sourceId?: string;
  title: string;
  content?: string;
  painPoint?: string;
  coreViewpoint?: string;
  reusableAsset?: string;
  outline?: string[];
  imageSuggestions?: string;
  tags?: string[];
  commentPrompt?: string;
  column?: string;
}

export interface ContentImagePalette {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  muted: string;
}

export interface ContentImageBlock {
  id: string;
  title: string;
  detail: string;
  meta?: string;
  lane?: string;
}

export interface ContentImageConnection {
  from: string;
  to: string;
  label?: string;
}

export interface ContentImagePlan {
  assetId: string;
  kind: "content";
  templateType: ContentImageTemplateType;
  sourceKey: string;
  title: string;
  subtitle: string;
  summary: string;
  blocks: ContentImageBlock[];
  connections: ContentImageConnection[];
  callouts: string[];
  palette: ContentImagePalette;
  reason: string;
}

export interface ContentImageTemplateDefinition {
  id: ContentImageTemplateType;
  name: string;
  description: string;
  previewTone: string;
  defaultPalette: ContentImagePalette;
}

export const CONTENT_IMAGE_TEMPLATES: ContentImageTemplateDefinition[] = [
  {
    id: "flowchart",
    name: "流程图",
    description: "适合步骤、决策路径、工作流拆解",
    previewTone: "节点 / 箭头 / 路径",
    defaultPalette: {
      background: "#f8fafc",
      surface: "#ffffff",
      primary: "#0f766e",
      secondary: "#0f172a",
      accent: "#e11d48",
      text: "#0f172a",
      muted: "#64748b",
    },
  },
  {
    id: "architecture",
    name: "架构图",
    description: "适合系统层级、模块协作、Agent 分工",
    previewTone: "分层 / 模块 / 边界",
    defaultPalette: {
      background: "#111827",
      surface: "#1f2937",
      primary: "#38bdf8",
      secondary: "#f8fafc",
      accent: "#fbbf24",
      text: "#f8fafc",
      muted: "#cbd5e1",
    },
  },
  {
    id: "checklist",
    name: "清单图",
    description: "适合可收藏清单、模板字段、检查项",
    previewTone: "勾选 / 卡片 / 可收藏",
    defaultPalette: {
      background: "#fff7ed",
      surface: "#ffffff",
      primary: "#c2410c",
      secondary: "#7c2d12",
      accent: "#0f766e",
      text: "#1c1917",
      muted: "#78716c",
    },
  },
  {
    id: "timeline",
    name: "时间线",
    description: "适合踩坑复盘、演进过程、前后顺序",
    previewTone: "时间轴 / 里程碑",
    defaultPalette: {
      background: "#f4f0ff",
      surface: "#ffffff",
      primary: "#4338ca",
      secondary: "#312e81",
      accent: "#db2777",
      text: "#111827",
      muted: "#6b7280",
    },
  },
  {
    id: "comparison",
    name: "对比图",
    description: "适合误区纠正、旧做法和新做法对照",
    previewTone: "左右对比 / 反差",
    defaultPalette: {
      background: "#f7fee7",
      surface: "#ffffff",
      primary: "#4d7c0f",
      secondary: "#1f2937",
      accent: "#dc2626",
      text: "#111827",
      muted: "#64748b",
    },
  },
  {
    id: "steps",
    name: "步骤图",
    description: "适合三步法、操作 SOP、教程拆解",
    previewTone: "编号 / 动作 / 结果",
    defaultPalette: {
      background: "#ecfeff",
      surface: "#ffffff",
      primary: "#0891b2",
      secondary: "#164e63",
      accent: "#f59e0b",
      text: "#0f172a",
      muted: "#64748b",
    },
  },
];

export function getContentImageTemplate(type?: ContentImageTemplateType): ContentImageTemplateDefinition {
  return CONTENT_IMAGE_TEMPLATES.find((template) => template.id === type) || CONTENT_IMAGE_TEMPLATES[0];
}

export function getImageSourceKey(input: ImageWorkflowSourceInput): string {
  return input.sourceId || input.title || "manual-image";
}

export function draftToImageSourceInput(draft: DraftNote): ImageWorkflowSourceInput {
  return {
    sourceType: "draft",
    sourceId: draft.noteId || draft.recordId,
    title: draft.title || draft.noteId,
    content: draft.content,
    imageSuggestions: draft.imageSuggestions,
    tags: draft.tags,
    commentPrompt: draft.commentPrompt,
    column: "草稿",
  };
}

export function contentCardToImageSourceInput(card: ContentCard): ImageWorkflowSourceInput {
  return {
    sourceType: "topic",
    sourceId: card.topicId || card.recordId,
    title: card.titleCandidates[0] || card.coreViewpoint || card.topicId,
    painPoint: card.painPoint,
    coreViewpoint: card.coreViewpoint,
    reusableAsset: card.reusableAsset,
    outline: card.outline,
    commentPrompt: card.commentPrompt,
    column: card.column,
  };
}

export function buildContentImagePrompt(
  input: ImageWorkflowSourceInput,
  templateType: ContentImageTemplateType,
  contentAspect: AspectId
): string {
  const template = getContentImageTemplate(templateType);
  return `你是小红书 AI Coding 账号的内容配图设计师。

任务：
基于笔记内容生成一张 ${contentAspect} 内容配图方案。图片类型是「${template.name}」，用途是放在小红书笔记正文内，帮助读者收藏和理解，不是封面图。

图片要求：
1. 内容必须来自输入，不要编造不存在的数据、工具效果、团队规模或收益。
2. 文案短，适合图片阅读；每个节点不超过 ${NODE_TEXT_MAX_CHARS} 个中文字符。
3. 优先表达流程、结构、清单、对比或步骤，不要写营销引导。
4. 输出要可被前端渲染成图，所以 blocks 和 connections 必须清晰；blocks 数量控制在 ${TEMPLATE_BLOCK_CAPACITY[templateType]} 个以内（超出的画不下）。
5. callouts 最多 ${MAX_CALLOUTS} 条，每条不超过 ${CALLOUT_MAX_CHARS} 个中文字符，写成可收藏提醒。

输入：
${JSON.stringify(input, null, 2)}

请只返回 JSON，不要解释。格式：
{
  "templateType": "${templateType}",
  "title": "图片标题",
  "subtitle": "小标题",
  "summary": "这张图解决什么理解问题",
  "blocks": [
    { "id": "n1", "title": "节点标题", "detail": "一句解释", "meta": "可选标签", "lane": "可选分组" }
  ],
  "connections": [
    { "from": "n1", "to": "n2", "label": "可选箭头说明" }
  ],
  "callouts": ["可收藏提醒"],
  "palette": {
    "background": "#f8fafc",
    "surface": "#ffffff",
    "primary": "#0f766e",
    "secondary": "#0f172a",
    "accent": "#e11d48",
    "text": "#0f172a",
    "muted": "#64748b"
  },
  "reason": "为什么用这个图"
}`;
}

function normalizeText(value: string | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function clipText(value: string | undefined, maxLength: number): string {
  const clean = normalizeText(value);
  if (!clean) return "";
  return Array.from(clean).slice(0, maxLength).join("");
}

function sourceText(input: ImageWorkflowSourceInput): string {
  return [
    input.title,
    input.painPoint,
    input.coreViewpoint,
    input.reusableAsset,
    input.content,
    input.imageSuggestions,
    ...(input.outline || []),
  ]
    .filter(Boolean)
    .join("\n");
}

function splitContentSegments(input: ImageWorkflowSourceInput): string[] {
  const outline = (input.outline || []).map((item) => normalizeText(item)).filter(Boolean);
  if (outline.length > 0) return outline;

  const content = sourceText(input)
    .split(/\n+|[。！？!?；;]/)
    .map((item) => item.replace(/^\d+[.、]\s*/, "").trim())
    .filter((item) => item.length > 0 && item.length <= 80);
  return content.length > 0 ? content : ["明确问题", "拆出边界", "生成方案", "验证结果"];
}

function inferTemplateType(input: ImageWorkflowSourceInput): ContentImageTemplateType {
  const text = sourceText(input);
  if (/架构|模块|系统|接口|数据表|Agent|分工|边界/.test(text)) return "architecture";
  if (/对比|之前|现在|误区|不是|别|不要|反而/.test(text)) return "comparison";
  if (/时间|阶段|先后|第[一二三四五六]|复盘|演进/.test(text)) return "timeline";
  if (/清单|模板|检查|字段|收藏/.test(text)) return "checklist";
  if (/步骤|流程|SOP|怎么做|操作/.test(text)) return "steps";
  return "flowchart";
}

export function createFallbackContentImagePlan(
  input: ImageWorkflowSourceInput,
  preferredType?: ContentImageTemplateType
): ContentImagePlan {
  const templateType = preferredType || inferTemplateType(input);
  const template = getContentImageTemplate(templateType);
  const segments = splitContentSegments(input).slice(0, 5);
  const blocks = segments.map((segment, index) => ({
    id: `n${index + 1}`,
    title: clipText(segment, NODE_TEXT_MAX_CHARS) || `步骤 ${index + 1}`,
    detail:
      index === 0
        ? clipText(input.painPoint || input.coreViewpoint || segment, 34)
        : clipText(segment, 34),
    meta: index === 0 ? "起点" : index === segments.length - 1 ? "结果" : "动作",
    lane: templateType === "architecture" ? ["输入", "处理", "输出"][Math.min(index, 2)] : undefined,
  }));

  return {
    assetId: `IMG-${Date.now().toString(36).toUpperCase()}`,
    kind: "content",
    templateType,
    sourceKey: getImageSourceKey(input),
    title: clipText(input.title, 22) || "内容结构图",
    subtitle: input.column ? `#${input.column} #内容配图` : "#AI编程 #内容配图",
    summary: clipText(input.coreViewpoint || input.content || input.reusableAsset, 60) || "把笔记内容拆成一张可收藏图。",
    blocks,
    connections: blocks.slice(1).map((block, index) => ({
      from: blocks[index].id,
      to: block.id,
      label: index === 0 ? "下一步" : undefined,
    })),
    callouts: [
      clipText(input.reusableAsset, CALLOUT_MAX_CHARS),
      clipText(input.commentPrompt, CALLOUT_MAX_CHARS),
    ].filter(Boolean),
    palette: template.defaultPalette,
    reason: `根据内容结构生成${template.name}，便于正文内解释和收藏。`,
  };
}

function unknownToText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const text = value.map((item) => unknownToText(item)).filter(Boolean).join(" ");
    return text || fallback;
  }
  if (typeof value === "object") {
    const text = Object.values(value as Record<string, unknown>).map((item) => unknownToText(item)).filter(Boolean).join(" ");
    return text || fallback;
  }
  return fallback;
}

function unknownToList(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const values = value.map((item) => unknownToText(item)).filter(Boolean);
    return values.length > 0 ? values : fallback;
  }
  const text = unknownToText(value);
  if (!text) return fallback;
  const values = text.split(/\n|、|，/).map((item) => item.trim()).filter(Boolean);
  return values.length > 0 ? values : fallback;
}

function normalizeTemplateType(value: unknown, fallback: ContentImageTemplateType): ContentImageTemplateType {
  const text = unknownToText(value);
  return CONTENT_IMAGE_TEMPLATES.some((template) => template.id === text)
    ? (text as ContentImageTemplateType)
    : fallback;
}

function normalizePalette(value: unknown, fallback: ContentImagePalette): ContentImagePalette {
  if (!value || typeof value !== "object") return fallback;
  const palette = value as Partial<ContentImagePalette>;
  return {
    background: unknownToText(palette.background, fallback.background),
    surface: unknownToText(palette.surface, fallback.surface),
    primary: unknownToText(palette.primary, fallback.primary),
    secondary: unknownToText(palette.secondary, fallback.secondary),
    accent: unknownToText(palette.accent, fallback.accent),
    text: unknownToText(palette.text, fallback.text),
    muted: unknownToText(palette.muted, fallback.muted),
  };
}

function normalizeBlocks(value: unknown, fallback: ContentImageBlock[], capacity: number): ContentImageBlock[] {
  if (!Array.isArray(value)) return fallback.slice(0, capacity);
  const blocks = value
    .map((item, index): ContentImageBlock | null => {
      if (!item || typeof item !== "object") return null;
      const block = item as Partial<ContentImageBlock>;
      const title = clipText(unknownToText(block.title), NODE_TEXT_MAX_CHARS);
      const detail = clipText(unknownToText(block.detail), 44);
      if (!title && !detail) return null;
      const normalized: ContentImageBlock = {
        id: unknownToText(block.id, `n${index + 1}`),
        title: title || `节点 ${index + 1}`,
        detail,
      };
      const meta = clipText(unknownToText(block.meta), 12);
      const lane = clipText(unknownToText(block.lane), 12);
      if (meta) normalized.meta = meta;
      if (lane) normalized.lane = lane;
      return normalized;
    })
    .filter((item): item is ContentImageBlock => Boolean(item));
  return (blocks.length > 0 ? blocks : fallback).slice(0, capacity);
}

function normalizeConnections(value: unknown, blocks: ContentImageBlock[]): ContentImageConnection[] {
  if (!Array.isArray(value)) {
    return blocks.slice(1).map((block, index) => ({ from: blocks[index].id, to: block.id }));
  }

  const blockIds = new Set(blocks.map((block) => block.id));
  const connections = value
    .map((item): ContentImageConnection | null => {
      if (!item || typeof item !== "object") return null;
      const connection = item as Partial<ContentImageConnection>;
      const from = unknownToText(connection.from);
      const to = unknownToText(connection.to);
      if (!blockIds.has(from) || !blockIds.has(to)) return null;
      const normalized: ContentImageConnection = {
        from,
        to,
      };
      const label = clipText(unknownToText(connection.label), 10);
      if (label) normalized.label = label;
      return normalized;
    })
    .filter((item): item is ContentImageConnection => Boolean(item));
  return connections.length > 0 ? connections : blocks.slice(1).map((block, index) => ({ from: blocks[index].id, to: block.id }));
}

export function normalizeContentImagePlan(
  value: Partial<ContentImagePlan>,
  fallback: ContentImagePlan
): ContentImagePlan {
  const templateType = normalizeTemplateType(value.templateType, fallback.templateType);
  const template = getContentImageTemplate(templateType);
  const palette = normalizePalette(value.palette, template.defaultPalette);
  const blocks = normalizeBlocks(value.blocks, fallback.blocks, TEMPLATE_BLOCK_CAPACITY[templateType]);

  return {
    assetId: unknownToText(value.assetId, fallback.assetId),
    kind: "content",
    templateType,
    sourceKey: unknownToText(value.sourceKey, fallback.sourceKey),
    title: clipText(unknownToText(value.title, fallback.title), 26),
    subtitle: clipText(unknownToText(value.subtitle, fallback.subtitle), 26),
    summary: clipText(unknownToText(value.summary, fallback.summary), 72),
    blocks,
    connections: normalizeConnections(value.connections, blocks),
    callouts: unknownToList(value.callouts, fallback.callouts)
      .map((item) => clipText(item, CALLOUT_MAX_CHARS))
      .filter(Boolean)
      .slice(0, MAX_CALLOUTS),
    palette,
    reason: unknownToText(value.reason, fallback.reason),
  };
}

const SANS_FONT = '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif';

export async function renderContentImageDataUrl(
  canvas: HTMLCanvasElement,
  plan: ContentImagePlan,
  px: readonly [number, number]
): Promise<string> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot get canvas context");

  const [width, height] = px;
  canvas.width = width;
  canvas.height = height;

  drawContentImageBackground(ctx, plan, width, height);
  drawContentImageHeader(ctx, plan, width);

  if (plan.templateType === "architecture") {
    drawArchitecture(ctx, plan, width, height);
  } else if (plan.templateType === "checklist") {
    drawChecklist(ctx, plan, width, height);
  } else if (plan.templateType === "timeline") {
    drawTimeline(ctx, plan, width, height);
  } else if (plan.templateType === "comparison") {
    drawComparison(ctx, plan, width, height);
  } else if (plan.templateType === "steps") {
    drawSteps(ctx, plan, width, height);
  } else {
    drawFlowchart(ctx, plan, width, height);
  }

  drawContentImageFooter(ctx, plan, width, height);
  return canvas.toDataURL("image/png", 1.0);
}

function drawContentImageBackground(
  ctx: CanvasRenderingContext2D,
  plan: ContentImagePlan,
  width: number,
  height: number
): void {
  const { palette } = plan;
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = hexToRgba(palette.primary, plan.templateType === "architecture" ? 0.14 : 0.1);
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 72) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawContentImageHeader(ctx: CanvasRenderingContext2D, plan: ContentImagePlan, width: number): void {
  const { palette } = plan;
  drawPill(ctx, getContentImageTemplate(plan.templateType).name, 72, 74, palette.primary, palette.surface, 30);

  ctx.fillStyle = palette.text;
  ctx.font = `900 76px ${SANS_FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  wrapText(ctx, plan.title, width - 144, 2).forEach((line, index) => {
    ctx.fillText(line, 72, 166 + index * 88);
  });

  ctx.fillStyle = palette.muted;
  ctx.font = `700 30px ${SANS_FONT}`;
  ctx.fillText(plan.subtitle, 72, 334, width - 144);
}

function drawFlowchart(ctx: CanvasRenderingContext2D, plan: ContentImagePlan, width: number, height: number): void {
  const blocks = plan.blocks.slice(0, TEMPLATE_BLOCK_CAPACITY[plan.templateType]);
  const startY = 430;
  const gap = 34;
  const cardHeight = Math.min(142, (height - 650 - gap * (blocks.length - 1)) / Math.max(blocks.length, 1));

  blocks.forEach((block, index) => {
    const y = startY + index * (cardHeight + gap);
    drawNodeCard(ctx, plan, block, 150, y, width - 300, cardHeight, index + 1);
    if (index < blocks.length - 1) {
      drawArrow(ctx, plan.palette.primary, width / 2, y + cardHeight + 6, width / 2, y + cardHeight + gap - 8);
    }
  });
}

function drawArchitecture(ctx: CanvasRenderingContext2D, plan: ContentImagePlan, width: number, height: number): void {
  const blocks = plan.blocks.slice(0, TEMPLATE_BLOCK_CAPACITY[plan.templateType]);
  const lanes = Array.from(new Set(blocks.map((block) => block.lane || "模块"))).slice(0, 3);
  const startY = 440;
  const laneHeight = 228;

  lanes.forEach((lane, laneIndex) => {
    const y = startY + laneIndex * (laneHeight + 34);
    ctx.fillStyle = hexToRgba(plan.palette.surface, 0.88);
    ctx.beginPath();
    ctx.roundRect(72, y, width - 144, laneHeight, 24);
    ctx.fill();
    ctx.fillStyle = plan.palette.primary;
    ctx.font = `900 28px ${SANS_FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(lane, 102, y + 36);

    const laneBlocks = blocks.filter((block) => (block.lane || "模块") === lane);
    laneBlocks.forEach((block, index) => {
      drawModuleCard(ctx, plan, block, 102 + index * 292, y + 72, 250, 112);
    });
  });
}

function drawChecklist(ctx: CanvasRenderingContext2D, plan: ContentImagePlan, width: number, _height: number): void {
  const blocks = plan.blocks.slice(0, TEMPLATE_BLOCK_CAPACITY[plan.templateType]);
  blocks.forEach((block, index) => {
    const y = 438 + index * 128;
    ctx.fillStyle = plan.palette.surface;
    ctx.beginPath();
    ctx.roundRect(82, y, width - 164, 98, 22);
    ctx.fill();
    ctx.fillStyle = plan.palette.accent;
    ctx.beginPath();
    ctx.roundRect(114, y + 28, 42, 42, 10);
    ctx.fill();
    ctx.strokeStyle = plan.palette.surface;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(125, y + 50);
    ctx.lineTo(138, y + 62);
    ctx.lineTo(156, y + 40);
    ctx.stroke();
    drawBlockText(ctx, plan, block, 184, y + 23, width - 246);
  });
}

function drawTimeline(ctx: CanvasRenderingContext2D, plan: ContentImagePlan, width: number, _height: number): void {
  const blocks = plan.blocks.slice(0, TEMPLATE_BLOCK_CAPACITY[plan.templateType]);
  const x = 148;
  ctx.strokeStyle = plan.palette.primary;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(x, 448);
  ctx.lineTo(x, 1040);
  ctx.stroke();

  blocks.forEach((block, index) => {
    const y = 448 + index * 148;
    ctx.fillStyle = plan.palette.accent;
    ctx.beginPath();
    ctx.arc(x, y + 46, 22, 0, Math.PI * 2);
    ctx.fill();
    drawNodeCard(ctx, plan, block, 216, y, width - 288, 104, index + 1);
  });
}

function drawComparison(ctx: CanvasRenderingContext2D, plan: ContentImagePlan, width: number, _height: number): void {
  const blocks = plan.blocks.slice(0, TEMPLATE_BLOCK_CAPACITY[plan.templateType]);
  const mid = Math.ceil(blocks.length / 2);
  const columns = [
    { title: "常见误区", blocks: blocks.slice(0, mid), color: plan.palette.accent },
    { title: "推荐做法", blocks: blocks.slice(mid), color: plan.palette.primary },
  ];

  columns.forEach((column, columnIndex) => {
    const x = columnIndex === 0 ? 72 : width / 2 + 24;
    const w = width / 2 - 96;
    ctx.fillStyle = hexToRgba(column.color, 0.14);
    ctx.beginPath();
    ctx.roundRect(x, 424, w, 670, 28);
    ctx.fill();
    drawPill(ctx, column.title, x + 24, 456, column.color, plan.palette.surface, 28);
    column.blocks.forEach((block, index) => {
      drawModuleCard(ctx, plan, block, x + 24, 540 + index * 148, w - 48, 112);
    });
  });
}

function drawSteps(ctx: CanvasRenderingContext2D, plan: ContentImagePlan, width: number, _height: number): void {
  const blocks = plan.blocks.slice(0, TEMPLATE_BLOCK_CAPACITY[plan.templateType]);
  blocks.forEach((block, index) => {
    const y = 438 + index * 176;
    ctx.fillStyle = plan.palette.surface;
    ctx.beginPath();
    ctx.roundRect(92, y, width - 184, 136, 24);
    ctx.fill();
    ctx.fillStyle = plan.palette.primary;
    ctx.font = `900 62px ${SANS_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1).padStart(2, "0"), 164, y + 68);
    drawBlockText(ctx, plan, block, 236, y + 30, width - 316);
  });
}

function drawContentImageFooter(ctx: CanvasRenderingContext2D, plan: ContentImagePlan, width: number, height: number): void {
  const { palette } = plan;
  const callouts = plan.callouts.slice(0, MAX_CALLOUTS);
  const footerY = height - 206;
  ctx.fillStyle = hexToRgba(palette.surface, 0.9);
  ctx.beginPath();
  ctx.roundRect(72, footerY, width - 144, 132, 26);
  ctx.fill();
  ctx.fillStyle = palette.primary;
  ctx.font = `900 26px ${SANS_FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("可收藏提醒", 104, footerY + 38);
  ctx.fillStyle = palette.text;
  ctx.font = `700 28px ${SANS_FONT}`;
  const footerText = callouts.length > 0 ? callouts.join(" / ") : plan.summary;
  wrapText(ctx, footerText, width - 208, 2).forEach((line, index) => {
    ctx.fillText(line, 104, footerY + 76 + index * 34);
  });
}

function drawNodeCard(
  ctx: CanvasRenderingContext2D,
  plan: ContentImagePlan,
  block: ContentImageBlock,
  x: number,
  y: number,
  width: number,
  height: number,
  index: number
): void {
  ctx.fillStyle = plan.palette.surface;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 24);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(plan.palette.primary, 0.24);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = plan.palette.primary;
  ctx.beginPath();
  ctx.roundRect(x + 26, y + 28, 56, 56, 16);
  ctx.fill();
  ctx.fillStyle = plan.palette.surface;
  ctx.font = `900 28px ${SANS_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(index), x + 54, y + 57);
  drawBlockText(ctx, plan, block, x + 112, y + 30, width - 146);
}

function drawModuleCard(
  ctx: CanvasRenderingContext2D,
  plan: ContentImagePlan,
  block: ContentImageBlock,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  ctx.fillStyle = hexToRgba(plan.palette.background, 0.68);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 18);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(plan.palette.primary, 0.36);
  ctx.lineWidth = 2;
  ctx.stroke();
  drawBlockText(ctx, plan, block, x + 20, y + 20, width - 40);
}

function drawBlockText(
  ctx: CanvasRenderingContext2D,
  plan: ContentImagePlan,
  block: ContentImageBlock,
  x: number,
  y: number,
  maxWidth: number
): void {
  ctx.fillStyle = plan.palette.text;
  ctx.font = `900 34px ${SANS_FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(block.title, x, y, maxWidth);
  ctx.fillStyle = plan.palette.muted;
  ctx.font = `700 24px ${SANS_FONT}`;
  wrapText(ctx, block.detail || block.meta || "", maxWidth, 2).forEach((line, index) => {
    ctx.fillText(line, x, y + 46 + index * 30, maxWidth);
  });
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  background: string,
  color: string,
  size: number
): void {
  ctx.save();
  ctx.font = `900 ${size}px ${SANS_FONT}`;
  const width = ctx.measureText(text).width + 44;
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(x, y, width, size + 28, 14);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 22, y + (size + 28) / 2);
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  color: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - 11, toY - 16);
  ctx.lineTo(toX + 11, toY - 16);
  ctx.closePath();
  ctx.fill();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    const next = current + char;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = char;
      if (lines.length >= maxLines) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function hexToRgba(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function downloadImageAsset(dataUrl: string, filename: string): void {
  downloadFile(dataUrl, filename);
}
