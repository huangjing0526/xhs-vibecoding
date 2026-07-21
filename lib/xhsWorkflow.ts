import { FeishuRecord, fieldToNumber, fieldToText } from "./feishu";
import { ACCOUNT_POSITIONING } from "./account";
import { deriveStrategyForCard, firstThreeLines, inferAssetType } from "./contentStrategy";
import {
  DEFAULT_TARGET_ID,
  parseTarget,
  parseTargets,
  serializeTargets,
} from "./targets";

/**
 * 各实体 status 字段的规范值。
 *
 * 类型仍是 string 而非这些常量的联合：飞书表可由人直接编辑，读到的值不受代码约束，
 * 收成封闭类型就得对未知值回落或断言——前者会静默改写人填的数据，后者是类型撒谎。
 * 这里只保证代码自己写入与比较时用同一份值。
 *
 * 注意与 NoteList 的 NoteStatus 区分：那个是由「选题 + 草稿」算出来的 UI 概念，
 * 取值（待写/待发/已发）不是任何实体的持久化字段。
 */
export const MATERIAL_STATUS = {
  pending: "待提炼",
  extracted: "已提炼",
} as const;

export const TOPIC_STATUS = {
  pending: "待写",
} as const;

export const DRAFT_STATUS = {
  pending: "待发布",
  published: "已发布",
} as const;

/**
 * 正文字数上限（中文字符）。同时写在草稿 prompt 与 limitDraftContent 里，两处必须一致。
 * 现为账号/小红书口径的固定值；接第二个目标时改由目标档案声明（见改造方案 Phase 3）。
 */
const BODY_MAX_CHARS = 200;

export interface MaterialItem {
  recordId: string;
  sourceId: string;
  sourceType: string;
  date: string;
  summary: string;
  event: string;
  pitfall: string;
  method: string;
  relatedTerm: string;
  status: string;
}

export interface GlossaryItem {
  recordId: string;
  term: string;
  explanation: string;
  misconception: string;
  caseText: string;
  reusableAsset: string;
  titleAngle: string;
}

export interface CoverMetadata {
  coverTitle?: string;
  coverSubtitle?: string;
  coverStyle?: string;
  coverPrimaryColor?: string;
  coverConfigJson?: string;
  coverStatus?: string;
}

export type ContentLane =
  | "work-situation"
  | "learning-growth"
  | "ai-radar"
  | "cashflow"
  | "safety-pitfall"
  | "life-family";

export type ReferencePool =
  | "trend-radar"
  | "tool-hands-on"
  | "workflow-system"
  | "learning-path";

export type ViralTitleStructure =
  | "pain-solved"
  | "before-after"
  | "ordinary-growth"
  | "workflow-reveal"
  | "result-demo"
  | "curiosity-opportunity";

export type ViralBodyStructure =
  | "story-method-asset"
  | "mistake-reframe-action"
  | "before-after-proof"
  | "trend-why-now-so-what";

export type HookType = "scene" | "contrast" | "result" | "question" | "awkward-moment";

export type AssetType = "prompt" | "checklist" | "table-fields" | "judgment-questions" | "mini-practice";

export type SimilarityRisk = "low" | "medium" | "high";

export interface StrategyMetadata {
  contentLane?: ContentLane;
  referencePool?: ReferencePool;
  viralTitleStructure?: ViralTitleStructure;
  viralBodyStructure?: ViralBodyStructure;
  hookType?: HookType;
  assetType?: AssetType;
}

export interface ContentCard extends CoverMetadata {
  recordId?: string;
  topicId: string;
  sourceMaterial: string;
  relatedTerm: string;
  column: string;
  targetReader: string;
  painPoint: string;
  coreViewpoint: string;
  realCase: string;
  reusableAsset: string;
  titleCandidates: string[];
  coverText: string;
  outline: string[];
  commentPrompt: string;
  estimatedSaveValue: number;
  status: string;
  /**
   * 这条选题打算投的发布目标（飞书「目标清单」）。一稿多投时一条选题对应多篇草稿。
   * 类型是 string 而非 TargetId：与 status 同理，飞书可人工编辑，读到代码尚未注册的目标
   * （如 Phase 4 前手填的 douyin-video）要原样保留，收成封闭类型会在写回时静默覆盖。
   */
  targets: string[];
  /** 道库评分（飞书 选题表 字段：质量分 / 命中道 / 偏爆偏哑） */
  daokuScore?: string;
  daokuHit?: string;
  daokuVerdict?: string;
  selectionScore?: number;
  selectionReason?: string;
  avoidSimilarTo?: string[];
  isManualPriority?: boolean;
  contentLane?: ContentLane;
  referencePool?: ReferencePool;
  viralTitleStructure?: ViralTitleStructure;
  viralBodyStructure?: ViralBodyStructure;
  hookType?: HookType;
  assetType?: AssetType;
}

export interface DraftNote extends CoverMetadata {
  recordId?: string;
  noteId: string;
  topicId: string;
  title: string;
  coverText: string;
  content: string;
  imageSuggestions: string;
  tags: string[];
  commentPrompt: string;
  status: string;
  /** 这篇草稿投向的发布目标（飞书「发布目标」）。string 而非 TargetId，理由见 ContentCard.targets。 */
  target: string;
  qualityScoreBeforeWrite?: number;
  qualityScoreAfterReview?: number;
  qualityIssues?: string[];
  openingHookPreview?: string;
  collectibleAssetPreview?: string;
  similarityRisk?: SimilarityRisk;
  contentLane?: ContentLane;
  referencePool?: ReferencePool;
  viralTitleStructure?: ViralTitleStructure;
  viralBodyStructure?: ViralBodyStructure;
  hookType?: HookType;
  assetType?: AssetType;
}

export interface ReviewMetric {
  noteId: string;
  title: string;
  /** 这条复盘对应的发布目标（飞书「发布目标」）。string 而非 TargetId，理由见 ContentCard.targets。 */
  target: string;
  reads: number;
  likes: number;
  saves: number;
  comments: number;
  shares: number;
  interactionRate: number;
  saveRate: number;
  contentLane?: ContentLane;
  referencePool?: ReferencePool;
  viralTitleStructure?: ViralTitleStructure;
  viralBodyStructure?: ViralBodyStructure;
  hookType?: HookType;
  assetType?: AssetType;
}

/** 复盘的「下次优化」动作，层级与发布前质检维度同构，让复盘建议能直接喂回质检关注点。 */
export type ReviewActionLayer = "选题" | "钩子" | "封面" | "标签" | "引导" | "内容价值";

export interface ReviewNextAction {
  layer: ReviewActionLayer;
  /** 下次具体怎么做 */
  advice: string;
  /** 依据的数据信号 */
  basedOn: string;
}

export interface ReviewResult {
  summary: string;
  topPatterns: string[];
  weakPatterns: string[];
  nextTopics: string[];
  stopTopics: string[];
  /** 按层级给出的下次优化清单 */
  nextActions: ReviewNextAction[];
  recordActions: Array<{
    noteId: string;
    diagnosis: string;
    action: "保留" | "重写" | "扩写" | "放弃";
    reason: string;
  }>;
}

export function normalizeMaterial(record: FeishuRecord): MaterialItem {
  const fields = record.fields || {};
  return {
    recordId: record.record_id,
    sourceId: fieldToText(fields["素材ID"]) || record.record_id,
    sourceType: fieldToText(fields["来源类型"]) || "开发日报",
    date: fieldToText(fields["日期"]),
    summary: fieldToText(fields["原文摘要"] ?? fields["摘要"] ?? fields["内容"]),
    event: fieldToText(fields["核心事件"] ?? fields["事件"]),
    pitfall: fieldToText(fields["踩坑点"] ?? fields["问题"]),
    method: fieldToText(fields["可复用方法"] ?? fields["方法"]),
    relatedTerm: fieldToText(fields["关联术语"]),
    status: fieldToText(fields["状态"]),
  };
}

function hasText(values: string[]): boolean {
  return values.some((value) => value.trim().length > 0);
}

export function hasMaterialContent(item: MaterialItem): boolean {
  return hasText([item.summary, item.event, item.pitfall, item.method]);
}

export function filterUsableMaterials(items: MaterialItem[]): MaterialItem[] {
  return items.filter(hasMaterialContent);
}

export function normalizeGlossary(record: FeishuRecord): GlossaryItem {
  const fields = record.fields || {};
  return {
    recordId: record.record_id,
    term: fieldToText(fields["术语"]),
    explanation: fieldToText(fields["一句话解释"] ?? fields["解释"]),
    misconception: fieldToText(fields["常见误区"]),
    caseText: fieldToText(fields["真实案例"]),
    reusableAsset: fieldToText(fields["可收藏资产"]),
    titleAngle: fieldToText(fields["适合标题角度"]),
  };
}

export function hasGlossaryContent(item: GlossaryItem): boolean {
  return hasText([
    item.term,
    item.explanation,
    item.misconception,
    item.caseText,
    item.reusableAsset,
    item.titleAngle,
  ]);
}

export function filterUsableGlossary(items: GlossaryItem[]): GlossaryItem[] {
  return items.filter(hasGlossaryContent);
}

function normalizeCoverMetadata(fields: Record<string, unknown>): CoverMetadata {
  return {
    coverTitle: fieldToText(fields["封面标题"]),
    coverSubtitle: fieldToText(fields["封面副标题"]),
    coverStyle: fieldToText(fields["封面风格"]),
    coverPrimaryColor: fieldToText(fields["封面主色"]),
    coverConfigJson: fieldToText(fields["封面配置JSON"]),
    coverStatus: fieldToText(fields["封面状态"]),
  };
}

function splitLineList(text: string): string[] {
  return text
    .split(/\n|、/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toOptionalEnum<T extends string>(value: string): T | undefined {
  const normalized = value.trim();
  return normalized ? (normalized as T) : undefined;
}

function normalizeStrategyMetadata(fields: Record<string, unknown>): StrategyMetadata {
  return {
    contentLane: toOptionalEnum<ContentLane>(fieldToText(fields["内容线"])),
    referencePool: toOptionalEnum<ReferencePool>(fieldToText(fields["参考池"])),
    viralTitleStructure: toOptionalEnum<ViralTitleStructure>(fieldToText(fields["标题结构"])),
    viralBodyStructure: toOptionalEnum<ViralBodyStructure>(fieldToText(fields["正文结构类型"])),
    hookType: toOptionalEnum<HookType>(fieldToText(fields["开头钩子类型"])),
    assetType: toOptionalEnum<AssetType>(fieldToText(fields["资产类型"])),
  };
}

export function hasGeneratedCover(item: CoverMetadata): boolean {
  if (item.coverStatus === "已生成") return true;
  return hasText([item.coverConfigJson || "", item.coverTitle || ""]);
}

export function normalizeContentCard(record: FeishuRecord): ContentCard {
  const fields = record.fields || {};
  const titleText = fieldToText(fields["标题候选"]);
  return {
    ...normalizeStrategyMetadata(fields),
    ...normalizeCoverMetadata(fields),
    targets: parseTargets(fieldToText(fields["目标清单"])),
    recordId: record.record_id,
    topicId: fieldToText(fields["选题ID"]) || record.record_id,
    sourceMaterial: fieldToText(fields["来源素材"]),
    relatedTerm: fieldToText(fields["关联术语"]),
    column: fieldToText(fields["栏目"]) || "案例",
    targetReader: fieldToText(fields["目标读者"]) || "产品经理/独立开发者",
    painPoint: fieldToText(fields["读者痛点"]),
    coreViewpoint: fieldToText(fields["核心观点"]),
    realCase: fieldToText(fields["真实案例"]),
    reusableAsset: fieldToText(fields["可收藏资产"]),
    titleCandidates: titleText.split(/\n|、/).map((item) => item.trim()).filter(Boolean),
    coverText: fieldToText(fields["封面文案"]),
    outline: fieldToText(fields["正文结构"]).split(/\n/).map((item) => item.trim()).filter(Boolean),
    commentPrompt: fieldToText(fields["评论引导"]),
    estimatedSaveValue: fieldToNumber(fields["预计收藏价值"]) || 3,
    status: fieldToText(fields["状态"]) || TOPIC_STATUS.pending,
    daokuScore: fieldToText(fields["质量分"]),
    daokuHit: fieldToText(fields["命中道"]),
    daokuVerdict: fieldToText(fields["偏爆偏哑"]),
    selectionScore: fieldToNumber(fields["生成前评分"]) || undefined,
    selectionReason: fieldToText(fields["选中原因"]),
    avoidSimilarTo: splitLineList(fieldToText(fields["避免重复主题"])),
    isManualPriority: fieldToText(fields["是否手动优先"]) === "是",
  };
}

export function hasContentCardContent(item: ContentCard): boolean {
  return hasText([
    item.sourceMaterial,
    item.relatedTerm,
    item.painPoint,
    item.coreViewpoint,
    item.realCase,
    item.reusableAsset,
    item.coverText,
    item.commentPrompt,
    ...item.titleCandidates,
    ...item.outline,
  ]);
}

export function filterUsableContentCards(items: ContentCard[]): ContentCard[] {
  return items.filter(hasContentCardContent);
}

export function normalizeDraftNote(record: FeishuRecord): DraftNote {
  const fields = record.fields || {};
  return {
    ...normalizeStrategyMetadata(fields),
    ...normalizeCoverMetadata(fields),
    recordId: record.record_id,
    noteId: fieldToText(fields["笔记ID"]) || record.record_id,
    target: parseTarget(fieldToText(fields["发布目标"])),
    topicId: fieldToText(fields["选题ID"]),
    title: fieldToText(fields["最终标题"] ?? fields["标题"]),
    coverText: fieldToText(fields["封面文案"]),
    content: fieldToText(fields["正文"]),
    imageSuggestions: fieldToText(fields["配图建议"]),
    tags: fieldToText(fields["话题标签"]).split(/\s+/).filter(Boolean),
    commentPrompt: fieldToText(fields["评论引导"]),
    status: fieldToText(fields["发布状态"]) || DRAFT_STATUS.pending,
    qualityScoreBeforeWrite: fieldToNumber(fields["写前评分"]) || undefined,
    qualityScoreAfterReview: fieldToNumber(fields["审后评分"]) || undefined,
    qualityIssues: splitLineList(fieldToText(fields["质检问题"])),
    openingHookPreview: fieldToText(fields["前三行预览"]),
    collectibleAssetPreview: fieldToText(fields["可收藏资产摘要"]),
    similarityRisk: toOptionalEnum<SimilarityRisk>(fieldToText(fields["相似风险"])),
  };
}

export function hasDraftContent(item: DraftNote): boolean {
  return hasText([
    item.title,
    item.coverText,
    item.content,
    item.imageSuggestions,
    item.commentPrompt,
    ...item.tags,
  ]);
}

export function filterUsableDrafts(items: DraftNote[]): DraftNote[] {
  return items.filter(hasDraftContent);
}

export function isPublishedDraft(item: DraftNote): boolean {
  return item.status === DRAFT_STATUS.published;
}

export function normalizeReviewMetric(record: FeishuRecord): ReviewMetric {
  const fields = record.fields || {};
  const reads = fieldToNumber(fields["阅读量"] ?? fields["播放量"]);
  const likes = fieldToNumber(fields["点赞量"]);
  const saves = fieldToNumber(fields["收藏量"]);
  const comments = fieldToNumber(fields["评论量"]);
  const shares = fieldToNumber(fields["分享量"]);
  const interactions = likes + saves + comments + shares;

  return {
    noteId: fieldToText(fields["笔记ID"]) || record.record_id,
    target: parseTarget(fieldToText(fields["发布目标"])),
    title: fieldToText(fields["标题"] ?? fields["笔记标题"]),
    reads,
    likes,
    saves,
    comments,
    shares,
    interactionRate: reads > 0 ? interactions / reads : 0,
    saveRate: reads > 0 ? saves / reads : 0,
    ...normalizeStrategyMetadata(fields),
  };
}

export function hasReviewMetricContent(item: ReviewMetric): boolean {
  return (
    hasText([item.title]) ||
    [item.reads, item.likes, item.saves, item.comments, item.shares].some((value) => value > 0)
  );
}

export function filterUsableReviewMetrics(items: ReviewMetric[]): ReviewMetric[] {
  return items.filter(hasReviewMetricContent);
}

export function filterByStatus<T extends { status: string }>(items: T[], targetStatus?: string): T[] {
  if (!targetStatus) return items;
  return items.filter((item) => item.status === targetStatus);
}

function dateTextToFeishuTimestamp(dateText: string): number | undefined {
  const match = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;

  const [, year, month, day] = match;
  const timestamp = new Date(`${year}-${month}-${day}T00:00:00+08:00`).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function compactMaterials(materials: MaterialItem[]): string {
  return materials
    .map((item, index) => {
      return `${index + 1}. 来源：${item.sourceType}｜素材ID：${item.sourceId}
摘要：${item.summary}
核心事件：${item.event}
踩坑点：${item.pitfall}
可复用方法：${item.method}
关联术语：${item.relatedTerm || "未指定"}`;
    })
    .join("\n\n");
}

function compactGlossary(glossary: GlossaryItem[]): string {
  return glossary
    .filter((item) => item.term)
    .map((item) => {
      return `- ${item.term}：${item.explanation}
常见误区：${item.misconception}
真实案例：${item.caseText}
可收藏资产：${item.reusableAsset}
标题角度：${item.titleAngle}`;
    })
    .join("\n");
}

export function buildContentCardPrompt(materials: MaterialItem[], glossary: GlossaryItem[], count: number): string {
  return `你是「Jing｜AI实践录」的小红书内容主编。

账号定位：
${ACCOUNT_POSITIONING}

任务：
从开发日报和 AI Coding 术语中提炼 ${count} 张小红书内容卡片。

内容原则：
1. 不写泛泛的 AI 鸡汤。
2. 每张卡片必须绑定一个真实开发场景。
3. 每张卡片必须提供一个可收藏资产：清单、模板、Prompt、流程或避坑表。
4. 少写“我做了什么”，多写“读者能学到什么”。
5. 标题优先使用痛点、反直觉、真实案例、具体结果。
6. 口吻必须像真实开发者的复盘，不像卖课博主、培训号或引流号。
7. 禁止编造素材里没有的数字、收益、团队规模、效率提升比例和“大厂”背书。
8. 禁止使用“点赞收藏评论区扣1”“私发给你”“领取模板”“救你”“效率翻倍”“提效秘诀”“避坑90%”等引流话术。
9. 可收藏资产要直接描述资产内容，例如“Agent 分工表字段：职责、输入、输出、验收口径”，不要做成诱导领取。
10. 评论引导只做真实讨论问题，不做私域转化。
11. 每张卡片都要补齐内容策略字段：内容线、参考池、标题结构、正文结构、开头钩子类型、资产类型。
12. 标题必须从具体场景、痛点、尴尬、结果或好奇心切入，不能写成内部选题或抽象方法论。

开发日报素材：
${compactMaterials(materials)}

AI Coding 术语：
${compactGlossary(glossary)}

请只返回 JSON，不要解释。格式：
{
  "cards": [
    {
      "topicId": "TOPIC-YYYYMMDD-001",
      "sourceMaterial": "素材ID或摘要",
      "relatedTerm": "关联术语",
      "column": "避坑/案例/术语/模板/工具对比",
      "targetReader": "目标读者",
      "painPoint": "读者痛点",
      "coreViewpoint": "核心观点",
      "realCase": "真实案例",
      "reusableAsset": "可收藏资产",
      "titleCandidates": ["标题1", "标题2", "标题3"],
      "coverText": "封面大字，允许换行",
      "outline": ["开头", "案例", "方法", "结尾"],
      "commentPrompt": "二选一评论问题",
      "estimatedSaveValue": 1,
      "contentLane": "work-situation/learning-growth/ai-radar/cashflow/safety-pitfall/life-family",
      "referencePool": "trend-radar/tool-hands-on/workflow-system/learning-path",
      "viralTitleStructure": "pain-solved/before-after/ordinary-growth/workflow-reveal/result-demo/curiosity-opportunity",
      "viralBodyStructure": "story-method-asset/mistake-reframe-action/before-after-proof/trend-why-now-so-what",
      "hookType": "scene/contrast/result/question/awkward-moment",
      "assetType": "prompt/checklist/table-fields/judgment-questions/mini-practice"
    }
  ]
}`;
}

export function buildDraftPrompt(card: ContentCard): string {
  return `请把下面这张内容卡片写成小红书笔记。

要求：
1. 开头 3 行直接说痛点或反直觉结论。
2. 中间必须包含真实案例。
3. 必须输出一个可收藏资产。
4. 语气像真实开发者复盘，不要营销腔，不要像卖课博主。
5. 结尾用一个真实讨论问题引导评论，不要做私域转化。
6. 不要编造数据和不存在的工具效果；素材里没有具体数字时，不能写“提升 30%”“效率翻倍”“节省 40 分钟”等量化结论。
7. 禁止出现“点赞收藏”“评论区扣1”“私发给你”“领取模板”“救你”“提效秘诀”“大厂复盘”“避坑90%”等话术。
8. 如果提到模板或清单，必须在正文里直接给出结构，不要让读者评论后领取。
9. 写法要克制：少用感叹号、少用煽动式反问，保留真实上下文和可复用步骤。
10. 不要把个人项目包装成团队成功学案例；素材没有团队背景时，使用“我这次/这个项目/这轮协作”。
11. 正文必须简明，总字数不超过 ${BODY_MAX_CHARS} 个中文字符。
12. 标题必须符合这条选题指定的标题结构，正文必须符合指定的正文结构。
13. 前 3 行必须出现具体场景、反差或结果。
14. 正文必须直接给出可收藏资产，不能只说“我整理了一个模板”。

内容卡片：
${JSON.stringify(card, null, 2)}

请只返回 JSON，不要解释。不要生成封面方案、流程图、架构图或配图方案；这些由独立的图片生成模块处理。格式：
{
  "topicId": "选题ID",
  "title": "最终标题",
  "content": "正文",
  "tags": ["#标签"],
  "commentPrompt": "评论引导"
}`;
}

export function buildReviewPrompt(metrics: ReviewMetric[]): string {
  return `请复盘这些小红书笔记数据。

账号定位：
${ACCOUNT_POSITIONING}

复盘目标：
判断问题卡在选题、标题封面、内容价值、互动引导中的哪一层，并给出下周优化方向。

下次优化要求：
给出 3-5 条「下次怎么做」的具体动作，每条挂到一个层级（只能用：选题 / 钩子 / 封面 / 标签 / 引导 / 内容价值），
并说明依据哪个数据信号。这些层级对应发布前质检维度，动作要具体到下次能照做。

数据：
${JSON.stringify(metrics, null, 2)}

请只返回 JSON，不要解释。格式：
{
  "summary": "总体结论",
  "topPatterns": ["表现好的共同点"],
  "weakPatterns": ["表现弱的共同点"],
  "nextTopics": ["下周继续做的选题方向"],
  "stopTopics": ["下周暂停的选题方向"],
  "nextActions": [
    {
      "layer": "选题/钩子/封面/标签/引导/内容价值",
      "advice": "下次具体怎么做",
      "basedOn": "依据的数据信号"
    }
  ],
  "recordActions": [
    {
      "noteId": "笔记ID",
      "diagnosis": "问题归因",
      "action": "保留/重写/扩写/放弃",
      "reason": "原因"
    }
  ]
}`;
}

function normalizeFallbackText(text: string | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function clipFallbackText(text: string, maxLength: number): string {
  const normalized = normalizeFallbackText(text);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function fallbackTopicSubject(material: MaterialItem): string {
  return (
    normalizeFallbackText(material.event) ||
    normalizeFallbackText(material.summary) ||
    normalizeFallbackText(material.sourceId) ||
    "这次开发任务"
  );
}

function materialSearchText(material: MaterialItem): string {
  return [
    material.sourceId,
    material.sourceType,
    material.summary,
    material.event,
    material.pitfall,
    material.method,
    material.relatedTerm,
  ]
    .join(" ")
    .toLowerCase();
}

function findFallbackGlossaryItem(
  material: MaterialItem,
  glossary: GlossaryItem[],
  index: number
): GlossaryItem | undefined {
  const relatedTerm = normalizeFallbackText(material.relatedTerm).toLowerCase();
  if (relatedTerm) {
    const exactMatch = glossary.find((item) => {
      const term = normalizeFallbackText(item.term).toLowerCase();
      return term && (term.includes(relatedTerm) || relatedTerm.includes(term));
    });
    if (exactMatch) return exactMatch;
  }

  const searchText = materialSearchText(material);
  const contextMatch = glossary.find((item) => {
    const term = normalizeFallbackText(item.term).toLowerCase();
    return term && searchText.includes(term);
  });
  if (contextMatch) return contextMatch;

  return glossary.length > 0 ? glossary[index % glossary.length] : undefined;
}

function inferFallbackTerm(material: MaterialItem): string {
  const searchText = materialSearchText(material);
  if (searchText.includes("handoff") || searchText.includes("交接")) return "Handoff";
  if (searchText.includes("agent")) return "Agent 协作";
  if (searchText.includes("baseline") || searchText.includes("台账")) return "基线台账";
  if (searchText.includes("schema") || searchText.includes("prisma") || searchText.includes("字段")) return "数据模型";
  if (searchText.includes("review") || searchText.includes("审计")) return "架构审计";
  return "";
}

function createFallbackTitleCandidates(
  topicSubject: string,
  term: string,
  pitfall: string,
  method: string
): string[] {
  const subject = clipFallbackText(topicSubject, 24);
  const pain = clipFallbackText(pitfall, 18);
  const action = clipFallbackText(method, 18);

  return [
    `${subject}：这一步别直接丢给 AI`,
    `${pain}？先用 ${term} 检查一遍`,
    `${action}，AI 才不容易返工`,
  ];
}

export function createFallbackContentCards(
  materials: MaterialItem[],
  glossary: GlossaryItem[],
  count: number
): ContentCard[] {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return materials.slice(0, count).map((material, index) => {
    const glossaryItem = findFallbackGlossaryItem(material, glossary, index);
    const term = material.relatedTerm || glossaryItem?.term || inferFallbackTerm(material) || "AI Coding 工作流";
    const event = material.event || material.summary || "一次真实开发任务";
    const pitfall = material.pitfall || "AI 容易漏掉业务上下文";
    const method = material.method || "先拆影响范围，再让 AI 写代码";
    const topicSubject = fallbackTopicSubject(material);
    const sourceSlug = (material.sourceId || material.recordId || String(index + 1))
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(-8)
      .toUpperCase();

    return deriveStrategyForCard({
      topicId: `TOPIC-${today}-${sourceSlug || String(index + 1).padStart(3, "0")}`,
      sourceMaterial: material.sourceId,
      relatedTerm: term,
      column: "案例",
      targetReader: "产品经理/独立开发者",
      painPoint: pitfall,
      coreViewpoint: `做 ${topicSubject} 时，先把 ${term} 和验收口径讲清楚，再让 AI 动代码。`,
      realCase: event,
      reusableAsset: method,
      titleCandidates: createFallbackTitleCandidates(topicSubject, term, pitfall, method),
      coverText: `${clipFallbackText(topicSubject, 12)}\n先别急着让 AI 写`,
      outline: [
        "开头指出常见误区",
        "用真实开发场景说明问题",
        `解释 ${term} 为什么重要`,
        "给出可复用清单或 Prompt",
        "用二选一问题引导评论",
      ],
      commentPrompt: "你用 AI 写代码时，更卡在需求描述，还是验收改 bug？",
      estimatedSaveValue: 4,
      status: TOPIC_STATUS.pending,
      targets: [DEFAULT_TARGET_ID],
      contentLane: "work-situation",
      referencePool: "workflow-system",
      viralTitleStructure: "pain-solved",
      viralBodyStructure: "story-method-asset",
      hookType: "scene",
      assetType: "prompt",
    });
  });
}

/**
 * 笔记ID 带发布目标后缀。一稿多投后同一选题会出多篇草稿，不带后缀会让发布时的复盘 upsert
 * 互相覆盖（见改造方案 4.4）。date 形如 20260715。
 */
export function makeNoteId(date: string, topicId: string, target: string): string {
  return `NOTE-${date}-${topicId.slice(-3)}-${target}`;
}

export function createFallbackDraft(card: ContentCard, target: string): DraftNote {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const title = card.titleCandidates[0] || card.coreViewpoint;
  return {
    noteId: makeNoteId(today, card.topicId, target),
    topicId: card.topicId,
    target,
    title,
    coverText: "",
    content: `这次踩坑是：${card.painPoint}\n\n场景：${card.realCase}\n\n我现在会先做三步：\n1. 让 AI 复述需求和边界\n2. 列出影响页面、接口、数据和测试\n3. 再进入代码实现\n\n可复用提示词：写代码前，先列出影响范围和不确定点。\n\n${card.commentPrompt}`,
    imageSuggestions: "",
    tags: ["#AI编程", "#VibeCoding", "#Claude", "#Cursor", "#产品经理"],
    commentPrompt: card.commentPrompt,
    status: DRAFT_STATUS.pending,
    qualityScoreBeforeWrite: card.selectionScore,
    openingHookPreview: firstThreeLines(`这次踩坑是：${card.painPoint}\n\n场景：${card.realCase}`),
    collectibleAssetPreview: card.reusableAsset,
    similarityRisk: "low",
    contentLane: card.contentLane,
    referencePool: card.referencePool,
    viralTitleStructure: card.viralTitleStructure,
    viralBodyStructure: card.viralBodyStructure,
    hookType: card.hookType,
    assetType: card.assetType,
  };
}

/** 规则版「下次优化」：从聚合数据信号推出分层动作，层级与发布前质检维度对齐。 */
function createFallbackNextActions(metrics: ReviewMetric[]): ReviewNextAction[] {
  const count = metrics.length || 1;
  const avgSaveRate = metrics.reduce((sum, item) => sum + item.saveRate, 0) / count;
  const avgInteraction = metrics.reduce((sum, item) => sum + item.interactionRate, 0) / count;
  const sortedReads = [...metrics].map((item) => item.reads).sort((a, b) => a - b);
  const medianReads = sortedReads[Math.floor(sortedReads.length / 2)] ?? 0;
  const lowReadHighSave = metrics.filter((item) => item.saveRate >= 0.05 && item.reads < medianReads);
  const highReadLowSave = metrics.filter((item) => item.reads >= 50 && item.saveRate < 0.03);

  const actions: ReviewNextAction[] = [];

  if (lowReadHighSave.length > 0) {
    actions.push({
      layer: "钩子",
      advice: "这些笔记收藏率不错但阅读偏低，下次标题加数字/反差钩子，别用平铺直叙的标题。",
      basedOn: `${lowReadHighSave.length} 篇「高收藏低阅读」：${lowReadHighSave.slice(0, 2).map((m) => m.title || m.noteId).join("、")}`,
    });
    actions.push({
      layer: "封面",
      advice: "封面文案改成结果前置（先抛结论/数字），提高点开率。",
      basedOn: "阅读偏低通常先卡在标题封面这一层。",
    });
  } else {
    actions.push({
      layer: "钩子",
      advice: "保持标题里的钩子要素（数字/提问/反差），延续当前点开表现。",
      basedOn: `整体阅读中位数 ${medianReads}，钩子层暂无明显短板。`,
    });
  }

  if (highReadLowSave.length > 0) {
    actions.push({
      layer: "标签",
      advice: "高阅读低收藏，可能标签偏泛流量，下次补 1-2 个长尾精准标签。",
      basedOn: `${highReadLowSave.length} 篇「高阅读低收藏」：${highReadLowSave.slice(0, 2).map((m) => m.title || m.noteId).join("、")}`,
    });
  }

  if (avgSaveRate < 0.05) {
    actions.push({
      layer: "内容价值",
      advice: "整体收藏率偏低，正文补可直接收藏的清单/模板/Prompt。",
      basedOn: `均收藏率 ${(avgSaveRate * 100).toFixed(1)}%，低于 5% 参考线。`,
    });
  }

  actions.push({
    layer: "引导",
    advice:
      avgInteraction < 0.03
        ? "互动率偏低，结尾换一个更具体的真实讨论问题，别用泛泛的「你觉得呢」。"
        : "延续结尾的真实讨论问题，保持评论区互动。",
    basedOn: `均互动率 ${(avgInteraction * 100).toFixed(1)}%。`,
  });

  return actions.slice(0, 5);
}

export function createFallbackReview(metrics: ReviewMetric[]): ReviewResult {
  const sortedByReads = [...metrics].sort((a, b) => b.reads - a.reads);
  const sortedBySaveRate = [...metrics].sort((a, b) => b.saveRate - a.saveRate);
  return {
    summary: "当前样本适合优先看阅读中位数、收藏率和评论断点。高收藏率主题值得扩写，阅读低但收藏高的主题优先换标题封面。",
    nextActions: createFallbackNextActions(metrics),
    topPatterns: sortedBySaveRate.slice(0, 3).map((item) => `${item.title || item.noteId} 收藏率较高，可复刻结构。`),
    weakPatterns: metrics
      .filter((item) => item.reads > 0 && item.saveRate === 0)
      .slice(0, 3)
      .map((item) => `${item.title || item.noteId} 有阅读但无收藏，需要补清单/模板/Prompt。`),
    nextTopics: [
      "AI 编程避坑：真实业务场景 + 影响范围清单",
      "Prompt/验收模板：让读者可以直接收藏复用",
      "工具分工实验：Claude、Cursor、Gemini 分别适合做什么",
    ],
    stopTopics: ["泛 AI 感悟", "纯项目流水账"],
    recordActions: sortedByReads.slice(0, 10).map((item) => ({
      noteId: item.noteId,
      diagnosis: item.saveRate >= 0.05 ? "内容价值强，适合扩写" : "收藏信号弱，需要补可复用资产",
      action: item.saveRate >= 0.05 ? "扩写" : item.reads >= 50 ? "重写" : "保留",
      reason: `阅读 ${item.reads}，收藏率 ${(item.saveRate * 100).toFixed(1)}%，互动率 ${(item.interactionRate * 100).toFixed(1)}%。`,
    })),
  };
}

function unknownToText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const text = value.map((item) => unknownToText(item)).filter(Boolean).join("\n");
    return text || fallback;
  }
  if (typeof value === "object") {
    const text = Object.values(value as Record<string, unknown>).map((item) => unknownToText(item)).filter(Boolean).join(" ");
    return text || fallback;
  }
  return fallback;
}

function unknownToTextList(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const values = value.map((item) => unknownToText(item)).filter(Boolean);
    return values.length > 0 ? values : fallback;
  }

  const text = unknownToText(value);
  if (!text) return fallback;

  const values = text
    .split(/\n|、/)
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : fallback;
}

function unknownToNumber(value: unknown, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(unknownToText(value));
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function hasMarketingTone(text: string): boolean {
  return /点赞收藏|评论区|扣\s*1|私发|领取|救你|效率翻倍|提效秘诀|避坑\s*90%|大厂复盘/.test(text);
}

function keepNonMarketingList(values: string[], fallback: string[]): string[] {
  const filtered = values.filter((value) => !hasMarketingTone(value));
  return filtered.length > 0 ? filtered : fallback;
}

function keepNonMarketingText(value: string, fallback: string): string {
  return hasMarketingTone(value) ? fallback : value;
}

function stripMarketingParagraphs(value: string, fallback: string): string {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter((paragraph) => !hasMarketingTone(paragraph));
  const content = paragraphs.join("\n\n");
  return content || fallback;
}

function limitDraftContent(value: string, maxLength = BODY_MAX_CHARS): string {
  const chars = Array.from(value.trim());
  return chars.length > maxLength ? chars.slice(0, maxLength).join("").trim() : value.trim();
}

export function normalizeGeneratedContentCard(card: Partial<ContentCard>, fallback: ContentCard): ContentCard {
  const titleCandidates = unknownToTextList(card.titleCandidates, fallback.titleCandidates);
  const commentPrompt = unknownToText(card.commentPrompt, fallback.commentPrompt);

  return deriveStrategyForCard({
    topicId: unknownToText(card.topicId, fallback.topicId),
    sourceMaterial: unknownToText(card.sourceMaterial, fallback.sourceMaterial),
    relatedTerm: unknownToText(card.relatedTerm, fallback.relatedTerm),
    column: unknownToText(card.column, fallback.column),
    targetReader: unknownToText(card.targetReader, fallback.targetReader),
    painPoint: unknownToText(card.painPoint, fallback.painPoint),
    coreViewpoint: unknownToText(card.coreViewpoint, fallback.coreViewpoint),
    realCase: unknownToText(card.realCase, fallback.realCase),
    reusableAsset: unknownToText(card.reusableAsset, fallback.reusableAsset),
    titleCandidates: keepNonMarketingList(titleCandidates, fallback.titleCandidates),
    coverText: unknownToText(card.coverText, fallback.coverText),
    outline: unknownToTextList(card.outline, fallback.outline),
    commentPrompt: keepNonMarketingText(commentPrompt, fallback.commentPrompt),
    estimatedSaveValue: unknownToNumber(card.estimatedSaveValue, fallback.estimatedSaveValue),
    status: unknownToText(card.status, fallback.status || TOPIC_STATUS.pending),
    // targets 由业务决定，不接受 AI 覆盖。
    targets: fallback.targets,
    selectionScore: unknownToNumber(card.selectionScore, fallback.selectionScore || 0) || undefined,
    selectionReason: unknownToText(card.selectionReason, fallback.selectionReason),
    avoidSimilarTo: unknownToTextList(card.avoidSimilarTo, fallback.avoidSimilarTo || []),
    isManualPriority: unknownToText(card.isManualPriority, fallback.isManualPriority ? "true" : "") === "true",
    contentLane: toOptionalEnum<ContentLane>(unknownToText(card.contentLane, fallback.contentLane)),
    referencePool: toOptionalEnum<ReferencePool>(unknownToText(card.referencePool, fallback.referencePool)),
    viralTitleStructure: toOptionalEnum<ViralTitleStructure>(unknownToText(card.viralTitleStructure, fallback.viralTitleStructure)),
    viralBodyStructure: toOptionalEnum<ViralBodyStructure>(unknownToText(card.viralBodyStructure, fallback.viralBodyStructure)),
    hookType: toOptionalEnum<HookType>(unknownToText(card.hookType, fallback.hookType)),
    assetType: toOptionalEnum<AssetType>(unknownToText(card.assetType, fallback.assetType)),
    coverTitle: unknownToText(card.coverTitle, fallback.coverTitle),
    coverSubtitle: unknownToText(card.coverSubtitle, fallback.coverSubtitle),
    coverStyle: unknownToText(card.coverStyle, fallback.coverStyle),
    coverPrimaryColor: unknownToText(card.coverPrimaryColor, fallback.coverPrimaryColor),
    coverConfigJson: unknownToText(card.coverConfigJson, fallback.coverConfigJson),
    coverStatus: unknownToText(card.coverStatus, fallback.coverStatus),
  });
}

export function normalizeGeneratedDraft(draft: Partial<DraftNote>, fallback: DraftNote): DraftNote {
  const content = unknownToText(draft.content, fallback.content);
  const tags = unknownToTextList(draft.tags, fallback.tags);

  const normalized = {
    // noteId 与 target 都由业务在生成前确定，不接受 AI 覆盖：noteId 内嵌 target 后缀，是发布时
    // 复盘 upsert 的匹配键（见 makeNoteId）。一稿多投时同一选题喂给 AI 的 prompt 对每个目标相同，
    // 若采信 AI 返回的 noteId，多个目标会拿到同一个 id，复盘行互相覆盖——正是本阶段要防的串台。
    noteId: fallback.noteId,
    topicId: unknownToText(draft.topicId, fallback.topicId),
    target: fallback.target,
    title: keepNonMarketingText(unknownToText(draft.title, fallback.title), fallback.title),
    coverText: unknownToText(draft.coverText, fallback.coverText),
    content: limitDraftContent(stripMarketingParagraphs(content, fallback.content)),
    imageSuggestions: unknownToText(draft.imageSuggestions, fallback.imageSuggestions),
    tags,
    commentPrompt: keepNonMarketingText(unknownToText(draft.commentPrompt, fallback.commentPrompt), fallback.commentPrompt),
    status: unknownToText(draft.status, fallback.status || DRAFT_STATUS.pending),
    qualityScoreBeforeWrite: unknownToNumber(draft.qualityScoreBeforeWrite, fallback.qualityScoreBeforeWrite || 0) || undefined,
    qualityScoreAfterReview: unknownToNumber(draft.qualityScoreAfterReview, fallback.qualityScoreAfterReview || 0) || undefined,
    qualityIssues: unknownToTextList(draft.qualityIssues, fallback.qualityIssues || []),
    openingHookPreview: unknownToText(draft.openingHookPreview, fallback.openingHookPreview),
    collectibleAssetPreview: unknownToText(
      draft.collectibleAssetPreview,
      fallback.collectibleAssetPreview || unknownToText(draft.content, "").slice(0, 48)
    ),
    similarityRisk: toOptionalEnum<SimilarityRisk>(unknownToText(draft.similarityRisk, fallback.similarityRisk)),
    contentLane: toOptionalEnum<ContentLane>(unknownToText(draft.contentLane, fallback.contentLane)),
    referencePool: toOptionalEnum<ReferencePool>(unknownToText(draft.referencePool, fallback.referencePool)),
    viralTitleStructure: toOptionalEnum<ViralTitleStructure>(unknownToText(draft.viralTitleStructure, fallback.viralTitleStructure)),
    viralBodyStructure: toOptionalEnum<ViralBodyStructure>(unknownToText(draft.viralBodyStructure, fallback.viralBodyStructure)),
    hookType: toOptionalEnum<HookType>(unknownToText(draft.hookType, fallback.hookType)),
    assetType: toOptionalEnum<AssetType>(unknownToText(draft.assetType, fallback.assetType)),
    coverTitle: unknownToText(draft.coverTitle, fallback.coverTitle),
    coverSubtitle: unknownToText(draft.coverSubtitle, fallback.coverSubtitle),
    coverStyle: unknownToText(draft.coverStyle, fallback.coverStyle),
    coverPrimaryColor: unknownToText(draft.coverPrimaryColor, fallback.coverPrimaryColor),
    coverConfigJson: unknownToText(draft.coverConfigJson, fallback.coverConfigJson),
    coverStatus: unknownToText(draft.coverStatus, fallback.coverStatus),
  };

  return {
    ...normalized,
    assetType: normalized.assetType || inferAssetType(normalized.collectibleAssetPreview || normalized.content),
    openingHookPreview: normalized.openingHookPreview || firstThreeLines(normalized.content),
  };
}

function appendCoverMetadataFields(fields: Record<string, unknown>, item: CoverMetadata): Record<string, unknown> {
  if (item.coverTitle) fields["封面标题"] = item.coverTitle;
  if (item.coverSubtitle) fields["封面副标题"] = item.coverSubtitle;
  if (item.coverStyle) fields["封面风格"] = item.coverStyle;
  if (item.coverPrimaryColor) fields["封面主色"] = item.coverPrimaryColor;
  if (item.coverConfigJson) fields["封面配置JSON"] = item.coverConfigJson;
  if (item.coverStatus) fields["封面状态"] = item.coverStatus;
  return fields;
}

function appendStrategyMetadataFields(fields: Record<string, unknown>, item: StrategyMetadata): Record<string, unknown> {
  if (item.contentLane) fields["内容线"] = item.contentLane;
  if (item.referencePool) fields["参考池"] = item.referencePool;
  if (item.viralTitleStructure) fields["标题结构"] = item.viralTitleStructure;
  if (item.viralBodyStructure) fields["正文结构类型"] = item.viralBodyStructure;
  if (item.hookType) fields["开头钩子类型"] = item.hookType;
  if (item.assetType) fields["资产类型"] = item.assetType;
  return fields;
}

export function mapContentCardToFeishuFields(card: ContentCard): Record<string, unknown> {
  return appendCoverMetadataFields(appendStrategyMetadataFields({
    "选题ID": card.topicId,
    "来源素材": card.sourceMaterial,
    "关联术语": card.relatedTerm,
    "栏目": card.column,
    "目标读者": card.targetReader,
    "读者痛点": card.painPoint,
    "核心观点": card.coreViewpoint,
    "真实案例": card.realCase,
    "可收藏资产": card.reusableAsset,
    "标题候选": card.titleCandidates.join("\n"),
    "封面文案": card.coverText,
    "正文结构": card.outline.join("\n"),
    "评论引导": card.commentPrompt,
    "预计收藏价值": card.estimatedSaveValue,
    "状态": card.status || TOPIC_STATUS.pending,
    "目标清单": serializeTargets(card.targets),
    ...(card.daokuScore ? { "质量分": card.daokuScore } : {}),
    ...(card.daokuHit ? { "命中道": card.daokuHit } : {}),
    ...(card.daokuVerdict ? { "偏爆偏哑": card.daokuVerdict } : {}),
    ...(card.selectionScore !== undefined ? { "生成前评分": card.selectionScore } : {}),
    ...(card.selectionReason ? { "选中原因": card.selectionReason } : {}),
    ...(card.avoidSimilarTo?.length ? { "避免重复主题": card.avoidSimilarTo.join("\n") } : {}),
    ...(card.isManualPriority ? { "是否手动优先": "是" } : {}),
  }, card), card);
}

export function mapMaterialToFeishuFields(item: MaterialItem): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    "素材ID": item.sourceId,
    "来源类型": item.sourceType,
    "原文摘要": item.summary,
    "核心事件": item.event,
    "踩坑点": item.pitfall,
    "可复用方法": item.method,
    "关联术语": item.relatedTerm,
    "状态": item.status || MATERIAL_STATUS.pending,
  };

  const dateValue = dateTextToFeishuTimestamp(item.date);
  if (dateValue !== undefined) {
    fields["日期"] = dateValue;
  }

  return fields;
}

export function mapGlossaryToFeishuFields(item: GlossaryItem): Record<string, unknown> {
  return {
    "术语": item.term,
    "一句话解释": item.explanation,
    "常见误区": item.misconception,
    "真实案例": item.caseText,
    "可收藏资产": item.reusableAsset,
    "适合标题角度": item.titleAngle,
  };
}

export function mapDraftToFeishuFields(draft: DraftNote): Record<string, unknown> {
  return appendCoverMetadataFields(appendStrategyMetadataFields({
    "笔记ID": draft.noteId,
    "选题ID": draft.topicId,
    "发布目标": draft.target,
    "最终标题": draft.title,
    "封面文案": draft.coverText,
    "正文": draft.content,
    "配图建议": draft.imageSuggestions,
    "话题标签": draft.tags.join(" "),
    "评论引导": draft.commentPrompt,
    "发布状态": draft.status || DRAFT_STATUS.pending,
    ...(draft.qualityScoreBeforeWrite !== undefined ? { "写前评分": draft.qualityScoreBeforeWrite } : {}),
    ...(draft.qualityScoreAfterReview !== undefined ? { "审后评分": draft.qualityScoreAfterReview } : {}),
    ...(draft.qualityIssues?.length ? { "质检问题": draft.qualityIssues.join("\n") } : {}),
    ...(draft.openingHookPreview ? { "前三行预览": draft.openingHookPreview } : {}),
    ...(draft.collectibleAssetPreview ? { "可收藏资产摘要": draft.collectibleAssetPreview } : {}),
    ...(draft.similarityRisk ? { "相似风险": draft.similarityRisk } : {}),
  }, draft), draft);
}

export function createReviewMetricFromDraft(draft: DraftNote): ReviewMetric {
  return {
    noteId: draft.noteId,
    title: draft.title,
    target: draft.target,
    reads: 0,
    likes: 0,
    saves: 0,
    comments: 0,
    shares: 0,
    interactionRate: 0,
    saveRate: 0,
    contentLane: draft.contentLane,
    referencePool: draft.referencePool,
    viralTitleStructure: draft.viralTitleStructure,
    viralBodyStructure: draft.viralBodyStructure,
    hookType: draft.hookType,
    assetType: draft.assetType,
  };
}

export function mapReviewMetricToFeishuFields(metric: ReviewMetric): Record<string, unknown> {
  return appendStrategyMetadataFields({
    "笔记ID": metric.noteId,
    "标题": metric.title,
    "发布目标": metric.target,
  }, metric);
}
