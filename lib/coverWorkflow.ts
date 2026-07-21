import {
  CoverConfig,
  COVER_TEMPLATES,
  CoverTemplateId,
  getCoverTemplate,
} from "./cover";
import { ACCOUNT_POSITIONING } from "./account";
import type { AspectId } from "./targets";
import { ContentCard, DraftNote } from "./xhsWorkflow";

/** 同时写在 prompt 文案里，两处必须一致。 */
const COVER_TITLE_MAX_CHARS = 24;

/** 超长标题按每行此长度切两行。 */
const COVER_TITLE_LINE_CHARS = 11;

export type CoverStyle = "痛点型" | "清单型" | "反差型" | "案例型";

export interface CoverPlan {
  style: CoverStyle;
  title: string;
  subtitle: string;
  backgroundColor: string;
  overlayColor: string;
  overlayOpacity: number;
  titleColor: string;
  titleSize: number;
  titlePosition: "center" | "left" | "bottom";
  reason: string;
}

export interface CoverInput {
  topicId?: string;
  noteId?: string;
  title?: string;
  coverText?: string;
  coreViewpoint?: string;
  painPoint?: string;
  reusableAsset?: string;
  realCase?: string;
  relatedTerm?: string;
  imageSuggestions?: string;
  column?: string;
}

export interface CoverTemplateOption {
  id: CoverTemplateId;
  name: string;
  description: string;
  previewTone: string;
  title: string;
  subtitle: string;
  reason: string;
  config: CoverConfig;
}

const COVER_PALETTES: Record<CoverStyle, Pick<CoverPlan, "backgroundColor" | "overlayColor" | "titleColor">> = {
  "痛点型": {
    backgroundColor: "#111827",
    overlayColor: "#dc2626",
    titleColor: "#ffffff",
  },
  "清单型": {
    backgroundColor: "#f8fafc",
    overlayColor: "#0f766e",
    titleColor: "#0f172a",
  },
  "反差型": {
    backgroundColor: "#312e81",
    overlayColor: "#f59e0b",
    titleColor: "#ffffff",
  },
  "案例型": {
    backgroundColor: "#0f172a",
    overlayColor: "#2563eb",
    titleColor: "#ffffff",
  },
};

export function contentCardToCoverInput(card: ContentCard): CoverInput {
  return {
    topicId: card.topicId,
    title: card.titleCandidates[0],
    coverText: card.coverText,
    coreViewpoint: card.coreViewpoint,
    painPoint: card.painPoint,
    reusableAsset: card.reusableAsset,
    realCase: card.realCase,
    relatedTerm: card.relatedTerm,
    column: card.column,
  };
}

export function draftToCoverInput(draft: DraftNote): CoverInput {
  return {
    noteId: draft.noteId,
    topicId: draft.topicId,
    title: draft.title,
    coverText: draft.coverText,
    imageSuggestions: draft.imageSuggestions,
    column: "草稿",
  };
}

export function buildCoverPlanPrompt(input: CoverInput, coverAspect: AspectId): string {
  return `你是小红书 AI Coding 账号的封面主编。

账号定位：
${ACCOUNT_POSITIONING}

任务：
根据内容信息生成小红书 ${coverAspect} 首图封面方案。

封面原则：
1. 第一眼必须看懂痛点或收益。
2. 字数要短，允许 2-3 行换行。
3. 不要营销腔，不要空泛鸡汤。
4. 风格从「痛点型、清单型、反差型、案例型」中选一个。
5. 标题不要超过 ${COVER_TITLE_MAX_CHARS} 个中文字符。

内容信息：
${JSON.stringify(input, null, 2)}

请只返回 JSON，不要解释。格式：
{
  "style": "痛点型",
  "title": "封面大字\\n允许换行",
  "subtitle": "小字副标题",
  "backgroundColor": "#111827",
  "overlayColor": "#dc2626",
  "overlayOpacity": 0.2,
  "titleColor": "#ffffff",
  "titleSize": 76,
  "titlePosition": "center",
  "reason": "为什么这样设计"
}`;
}

function pickStyle(input: CoverInput): CoverStyle {
  const text = `${input.title || ""} ${input.coverText || ""} ${input.painPoint || ""} ${input.reusableAsset || ""}`;
  if (/清单|模板|Prompt|流程|验收|步骤/.test(text)) return "清单型";
  if (/别|不|不是|反而|误区|乱猜|死循环/.test(text)) return "反差型";
  if (/坑|怕|漏|失败|翻车|问题/.test(text)) return "痛点型";
  return "案例型";
}

function styleToTemplateId(style: CoverStyle): CoverTemplateId {
  const map: Record<CoverStyle, CoverTemplateId> = {
    "痛点型": "alert",
    "清单型": "checklist",
    "反差型": "contrast",
    "案例型": "casefile",
  };
  return map[style];
}

export function getCoverSourceKey(input: CoverInput): string {
  return input.noteId || input.topicId || input.title || "manual-cover";
}

function trimCoverTitle(text: string): string {
  const clean = text.replace(/[｜|:：]/g, "\n").replace(/\s+/g, " ").trim();
  if (!clean) return "AI 编程\n先别急着写代码";
  if (clean.includes("\n")) return clean;
  if (clean.length <= 12) return clean;
  if (clean.length <= COVER_TITLE_MAX_CHARS) {
    const midpoint = Math.ceil(clean.length / 2);
    return `${clean.slice(0, midpoint)}\n${clean.slice(midpoint)}`;
  }
  return `${clean.slice(0, COVER_TITLE_LINE_CHARS)}\n${clean.slice(COVER_TITLE_LINE_CHARS, COVER_TITLE_LINE_CHARS * 2)}`;
}

function compactText(text: string | undefined, maxLength: number): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > maxLength ? clean.slice(0, maxLength) : clean;
}

function isImageSuggestion(text: string | undefined): boolean {
  return /首图|第二张|第三张|配图|图片|封面预览/.test(text || "");
}

function normalizeQuestion(text: string | undefined): string {
  const clean = compactText(text, 12)
    .replace(/^AI\s*容易/, "总")
    .replace(/^容易/, "总")
    .replace(/[。.!！?？]$/g, "");
  return clean ? `${clean}？` : "总漏上下文？";
}

function createTitleVariants(input: CoverInput): Record<CoverTemplateId, string> {
  const directTitle = trimCoverTitle(input.coverText || input.title || input.coreViewpoint || "");
  const painQuestion = normalizeQuestion(input.painPoint);
  const reusableAsset = isImageSuggestion(input.reusableAsset) ? "" : compactText(input.reusableAsset, 10);
  const realCase = compactText(input.realCase || input.title, 10);
  const relatedTerm = compactText(input.relatedTerm, 8);

  return {
    alert: directTitle || `AI 写代码\n${painQuestion}`,
    checklist: reusableAsset ? `${reusableAsset}\n可以直接复用` : "让 AI 少返工\n先做这 3 步",
    command: relatedTerm ? `${relatedTerm}\n不是口号` : "AI Coding\n真实复盘",
    casefile: realCase ? `${realCase}\n复盘记录` : "一次真实改动\n暴露的问题",
    contrast: /别|不|不是|反而|误区/.test(directTitle) ? directTitle : "别急着\n让 AI 写代码",
    sticky: reusableAsset ? `${reusableAsset}\n小抄` : "这句 Prompt\n先存下来",
  };
}

function createSubtitle(input: CoverInput): string {
  const column = input.column || "AI编程";
  return `#${column} #VibeCoding`;
}

function createTemplateOption(
  id: CoverTemplateId,
  input: CoverInput,
  title: string,
  reason: string
): CoverTemplateOption {
  const template = getCoverTemplate(id);
  const subtitle = createSubtitle(input);

  return {
    id,
    name: template.name,
    description: template.description,
    previewTone: template.previewTone,
    title,
    subtitle,
    reason,
    config: {
      ...template.config,
      sourceKey: getCoverSourceKey(input),
      title,
      subtitle,
    },
  };
}

export function createCoverTemplateOptions(input: CoverInput): CoverTemplateOption[] {
  const titleVariants = createTitleVariants(input);
  const options = COVER_TEMPLATES.map((template) =>
    createTemplateOption(
      template.id,
      input,
      titleVariants[template.id],
      `${template.name}适合${template.description}。`
    )
  );
  const preferredId = styleToTemplateId(pickStyle(input));
  const preferred = options.find((option) => option.id === preferredId);
  const rest = options.filter((option) => option.id !== preferredId);
  return preferred ? [preferred, ...rest] : options;
}

export function createFallbackCoverPlan(input: CoverInput): CoverPlan {
  const style = pickStyle(input);
  const palette = COVER_PALETTES[style];
  const rawTitle = input.coverText || input.title || input.painPoint || input.coreViewpoint || "";

  return {
    style,
    title: trimCoverTitle(rawTitle),
    subtitle: input.column ? `#${input.column} #AI编程` : "#AI编程 #VibeCoding",
    backgroundColor: palette.backgroundColor,
    overlayColor: palette.overlayColor,
    overlayOpacity: style === "清单型" ? 0.08 : 0.22,
    titleColor: palette.titleColor,
    titleSize: style === "清单型" ? 72 : 80,
    titlePosition: style === "案例型" ? "left" : "center",
    reason: "基于标题和痛点自动生成的封面方案。",
  };
}

const COVER_STYLES: readonly CoverStyle[] = ["痛点型", "清单型", "反差型", "案例型"];
const COVER_TITLE_POSITIONS: readonly CoverPlan["titlePosition"][] = ["center", "left", "bottom"];

function asPlainText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asBoundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function asOneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * 把 AI 返回的封面标题收进 COVER_TITLE_MAX_CHARS。
 * 按可见字符数（去掉换行）判断：预算内原样保留——AI 被明确要求可用 \n 换行，旧 AI 路径也裸透传，
 * 过一遍 trimCoverTitle 反而会把 \n 归一成空格、破坏换行意图；只有超预算才拍平后交给 trimCoverTitle
 * 折成两行（末支截到两行 × 每行 COVER_TITLE_LINE_CHARS）。这样只补齐「AI 路径不截 24」的缺口，
 * 不改动预算内标题的既有渲染。
 */
function normalizeCoverTitle(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  const visibleLength = Array.from(raw.replace(/\n/g, "")).length;
  if (visibleLength <= COVER_TITLE_MAX_CHARS) return raw;
  return trimCoverTitle(raw.replace(/\n/g, " "));
}

/**
 * 校验并收口 AI 返回的封面方案，角色对齐 normalizeContentImagePlan：兜未知/越界字段，
 * 并把标题收进 COVER_TITLE_MAX_CHARS。原先 covers 路由裸展开 {...fallback, ...aiResult} 对
 * AI 输出零校验，coverPlanToCoverConfig 又原样透传 plan.title——≤24 只在兜底路径生效，AI 路径
 * 完全不执行（见改造方案 Phase 3 附带 bug）。
 */
export function normalizeCoverPlan(value: Partial<CoverPlan>, fallback: CoverPlan): CoverPlan {
  return {
    style: asOneOf(value.style, COVER_STYLES, fallback.style),
    title: normalizeCoverTitle(value.title, fallback.title),
    subtitle: asPlainText(value.subtitle, fallback.subtitle),
    backgroundColor: asPlainText(value.backgroundColor, fallback.backgroundColor),
    overlayColor: asPlainText(value.overlayColor, fallback.overlayColor),
    overlayOpacity: asBoundedNumber(value.overlayOpacity, fallback.overlayOpacity, 0, 1),
    titleColor: asPlainText(value.titleColor, fallback.titleColor),
    titleSize: asBoundedNumber(value.titleSize, fallback.titleSize, 40, 120),
    titlePosition: asOneOf(value.titlePosition, COVER_TITLE_POSITIONS, fallback.titlePosition),
    reason: asPlainText(value.reason, fallback.reason),
  };
}

export function coverPlanToCoverConfig(plan: CoverPlan): CoverConfig {
  const template = getCoverTemplate(styleToTemplateId(plan.style));
  return {
    ...template.config,
    backgroundColor: plan.backgroundColor,
    overlayColor: plan.overlayColor,
    overlayOpacity: plan.overlayOpacity,
    overlayBlur: 0,
    title: plan.title,
    subtitle: plan.subtitle,
    titleSize: plan.titleSize,
    titleColor: plan.titleColor,
    titlePosition: plan.titlePosition,
  };
}

export function mapCoverToFeishuFields(plan: CoverPlan, config: CoverConfig): Record<string, unknown> {
  return {
    "封面标题": plan.title,
    "封面副标题": plan.subtitle,
    "封面风格": plan.style,
    "封面主色": plan.backgroundColor,
    "封面配置JSON": JSON.stringify(config, null, 2),
    "封面状态": "已生成",
  };
}
