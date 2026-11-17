/**
 * 爆款信号打分：判断「别人的内容为什么爆」。
 *
 * 与 `lib/topicScoring.ts` 是两件事，不要混：
 * - topicScoring 打的是「我的选题值不值得写」，输入 ContentCard，输出 selectionScore。
 * - 本文件打的是「这条已发布内容为什么爆」，输入对标笔记/拆片结果（带真实互动数据），输出 viralityScore。
 *
 * 核心口径：打的是**病毒潜力**，不是**内容质量**。两者经常反向——一条严谨的干货可能传播极差，
 * 一条有争议的观点可能质量一般却传得极广。混成一个分数，两个都不准。
 */

/**
 * 内容类型与信息密度：先分类再打分，同一条信号在教程里和在故事里的权重完全不同。
 *
 * 只留常量数组，不再额外声明联合类型：`ViralAnalysis.contentType` 是 `string`，
 * 真正的约束在运行时的 `pickFromList`——飞书列可以被人直接改，读进来的值不受代码约束。
 * 这与 refactor-plan Phase 2a 对 status「不收成封闭联合」的结论是同一条理由。
 */
const CONTENT_TYPES = ["教程", "观点", "故事", "测评", "清单", "访谈", "vlog"] as const;
const INFO_DENSITIES = ["低", "中", "高"] as const;

/**
 * 八条爆款信号，**按影响力从高到低排列**，顺序本身是信息，不要随意调整。
 * label 是写回飞书「命中信号」列的值，改动等于改数据，需同步历史数据。
 */
export const VIRAL_SIGNALS: Array<{ label: string; hint: string }> = [
  { label: "钩子时刻", hint: "「秘密是…」「没人说过…」「我完全搞错了…」这类让人停下来的开场" },
  { label: "情绪峰值", hint: "真实、未经设计的惊讶/大笑/愤怒/脆弱，不是表演出来的" },
  { label: "观点炸弹", hint: "有争议、反直觉，能激发赞同或反对，评论区会吵起来" },
  { label: "认知重构", hint: "意外的事实、数据或坦白，让人「原来如此」" },
  { label: "冲突与张力", hint: "立场对撞、预期落差、悬而未决" },
  { label: "可独立成卡片的金句", hint: "单独截出来也成立、值得被转述的一句话" },
  { label: "故事高潮或反转", hint: "有铺垫、有转折，不是平铺直叙" },
  { label: "立刻能用的实用价值", hint: "看完马上能照做，值得收藏" },
];

const VIRAL_SIGNAL_LABELS: string[] = VIRAL_SIGNALS.map((signal) => signal.label);

/** 打分对象的真实互动数据。字段可缺——不同平台能拿到的指标不同。 */
export interface ViralMetrics {
  views?: number;
  likes?: number;
  saves?: number;
  comments?: number;
  shares?: number;
}

export interface ViralAnalysisInput {
  title: string;
  /** 正文或口播脚本 */
  content: string;
  platform?: string;
  tags?: string[];
  metrics?: ViralMetrics;
}

export interface ViralAnalysis {
  contentType: string;
  infoDensity: string;
  /** 病毒潜力 0-100，不是内容质量分 */
  viralityScore: number;
  /** 命中的信号，取值来自 VIRAL_SIGNALS 的 label */
  hitSignals: string[];
  /** 前 3 秒让人停止划走的那句原文——反推选题时最有用的单个字段 */
  hookSentence: string;
  /** 为什么给这个分 */
  reason: string;
  /** 互动率（(赞+藏+评+转)/阅读），拿不到数据时为 undefined */
  engagementRate?: number;
}

/**
 * 兜底折算的半分点：互动率等于该值时记 50 分。
 *
 * 用饱和曲线 `100 * rate / (rate + K)` 而不是线性折算，是因为线性需要先假定一个「满分互动率」，
 * 而这个值在不同平台、不同粉丝量级上差一个数量级——定低了所有爆款一起撞顶 100 分（实测小红书
 * 样本互动率普遍 13%+，10% 的满分线直接让排序失效），定高了又全挤在低分区。
 * 饱和曲线单调、永不撞顶，任何量级都能排出先后。
 *
 * 这是**排序刻度**，不是业务规则：只在无 AI 的兜底路径上用于把有真实数据的内容排出先后，
 * 不参与任何判断或阈值。当前按小红书样本标定；接第二个平台时应随平台档案下沉，不要在这里加配置项。
 */
const ENGAGEMENT_HALF_SCORE_RATE = 0.05;

/**
 * 无阅读量时的兜底刻度：互动总量等于该值时记 50 分。
 *
 * 为什么需要这一层：小红书与抖音的**公开数据里没有阅读量**（浏览量只有创作者本人后台可见，
 * 采集侧只能拿到点赞/收藏/评论/分享）。只按互动率折算的话，采集回来的对标笔记会全部因为
 * 缺 views 而拿 0 分，兜底排序在主平台上直接失效。
 *
 * 同样是**排序刻度**，但比互动率弱一档：绝对互动量受粉丝规模主导，
 * **跨账号不可比**，只适合在同一个账号的笔记之间排先后。reason 里会写明这一点。
 */
const INTERACTION_HALF_SCORE_COUNT = 1000;

const MAX_CONTENT_CHARS = 4000;

function clip(text: string, max: number): string {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  // String.length（UTF-16 单元数）恒 ≥ 码点数，所以这里只会在「确实不需要截」时短路，
  // 避免对上万字的正文白建一个逐字符数组。真要截时仍走 Array.from，不切断代理对。
  if (normalized.length <= max) return normalized;
  return Array.from(normalized).slice(0, max).join("");
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** 互动总量 = 赞+藏+评+转。全缺时返回 undefined，与「都是 0」区分开。 */
function calcInteractions(metrics?: ViralMetrics): number | undefined {
  if (!metrics) return undefined;
  const parts = [metrics.likes, metrics.saves, metrics.comments, metrics.shares];
  if (parts.every((value) => value === undefined)) return undefined;
  return parts.reduce((sum: number, value) => sum + (value || 0), 0);
}

/** 互动率 = (赞+藏+评+转)/阅读。阅读量缺失或为 0 时返回 undefined，不猜。 */
function calcEngagementRate(metrics?: ViralMetrics): number | undefined {
  const views = metrics?.views || 0;
  if (views <= 0) return undefined;
  return (calcInteractions(metrics) || 0) / views;
}

/** 饱和折算：单调、永不撞顶，任何量级都能排出先后。 */
function saturate(value: number, halfScoreAt: number): number {
  return clampScore((100 * value) / (value + halfScoreAt));
}

function metricsText(metrics: ViralMetrics = {}): string {
  const parts = [
    metrics.views !== undefined ? `阅读 ${metrics.views}` : "",
    metrics.likes !== undefined ? `点赞 ${metrics.likes}` : "",
    metrics.saves !== undefined ? `收藏 ${metrics.saves}` : "",
    metrics.comments !== undefined ? `评论 ${metrics.comments}` : "",
    metrics.shares !== undefined ? `分享 ${metrics.shares}` : "",
  ].filter(Boolean);
  if (!parts.length) return "（没抓到互动数据）";

  const rate = calcEngagementRate(metrics);
  const rateText = rate === undefined ? "" : `｜互动率 ${(rate * 100).toFixed(2)}%`;
  return `${parts.join(" · ")}${rateText}`;
}

export function buildViralAnalysisPrompt(input: ViralAnalysisInput): string {
  const signalList = VIRAL_SIGNALS.map((signal, index) => `${index + 1}. ${signal.label}：${signal.hint}`).join("\n");
  const tags = (input.tags || []).filter(Boolean).join(" ");

  return `你在帮一个做内容的团队拆解一条已经发布的对标内容，判断它**为什么会传播**。

平台：${input.platform || "未知"}
标题：${input.title || "（无）"}
话题标签：${tags || "（无）"}
真实互动数据：${metricsText(input.metrics)}
正文 / 口播脚本：
${clip(input.content, MAX_CONTENT_CHARS) || "（没抓到正文，只能基于标题和数据推断）"}

请按两步来：

第一步，先做两个前置判断：
- 内容类型：从 ${CONTENT_TYPES.join(" / ")} 里选一个最贴的。
- 信息密度：从 ${INFO_DENSITIES.join(" / ")} 里选一个（低=废话多，高=干货密）。

第二步，带着这两个判断，按下面八条信号（已按影响力从高到低排列）逐条核对，列出**真正命中**的：
${signalList}

打分口径（重要）：
- 打的是**病毒潜力**（传播得开不开），**不是内容质量**（写得好不好）。二者经常反向：严谨的干货可能传播极差，有争议的观点可能质量一般却传得很广。请只判断传播力。
- 有真实互动数据时，以数据为主要依据，正文用来解释「为什么是这个数据」。
- 宁缺毋滥：原文里没有的信号不要凑数，命中 1 条也比编 5 条有用。

同时摘出 hookSentence：前 3 秒（或前两行）让人停止划走的**那一句原文**，必须逐字来自原文，不要改写。

只返回 JSON，不要解释。格式：
{
  "contentType": "内容类型",
  "infoDensity": "信息密度",
  "viralityScore": 0-100 的整数,
  "hitSignals": ["命中的信号名，取值必须来自上面八条"],
  "hookSentence": "逐字摘自原文的那一句",
  "reason": "一两句话说明为什么给这个分"
}`;
}

/**
 * 无 AI 时的兜底：**只按真实互动数据折算排序分，不编造信号和类型**。
 * 有真实数据时，用数据排序远比让规则猜「像不像爆款」诚实；
 * 连数据都没有时给 0 分并在 reason 里说明，不让一个假分数混进排序。
 *
 * 三档降级，逐档变弱，reason 里都写明用了哪一档：
 * ① 有阅读量 → 互动率，跨账号可比
 * ② 只有互动量（小红书/抖音公开数据的常态）→ 绝对互动量，仅同账号内可比
 * ③ 什么都没有 → 0 分，请人工评估
 */
export function createFallbackViralAnalysis(input: ViralAnalysisInput): ViralAnalysis {
  const engagementRate = calcEngagementRate(input.metrics);
  // 三条路径只差分数与文案，其余一致——共用 base，让这件事从形状上就看得出来
  const base = { contentType: "", infoDensity: "", hitSignals: [], hookSentence: "", engagementRate };

  if (engagementRate !== undefined) {
    return {
      ...base,
      viralityScore: saturate(engagementRate, ENGAGEMENT_HALF_SCORE_RATE),
      reason: `未配置 AI，按真实互动率 ${(engagementRate * 100).toFixed(2)}% 折算排序分，未做信号拆解。`,
    };
  }

  const interactions = calcInteractions(input.metrics);
  if (interactions !== undefined) {
    return {
      ...base,
      viralityScore: saturate(interactions, INTERACTION_HALF_SCORE_COUNT),
      reason: `未配置 AI，且平台不公开阅读量，按互动总量 ${interactions} 折算排序分（受粉丝规模影响，跨账号不可比）。`,
    };
  }

  return { ...base, viralityScore: 0, reason: "未配置 AI，且没抓到任何互动数据，无法判断传播力，请手动评估。" };
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function pickFromList(value: unknown, allowed: readonly string[]): string {
  const text = str(value);
  return allowed.includes(text) ? text : "";
}

/**
 * 归一模型输出。`generateWorkflowJson<T>` 是类型断言而非校验，模型返回什么都可能，
 * 这里把越界值清掉而不是原样透传——避免飞书里出现八条之外的信号名。
 */
export function normalizeViralAnalysis(
  raw: Partial<ViralAnalysis> | undefined,
  fallback: ViralAnalysis
): ViralAnalysis {
  if (!raw) return fallback;

  const hitSignals = Array.isArray(raw.hitSignals)
    ? Array.from(new Set(raw.hitSignals.map((item) => pickFromList(item, VIRAL_SIGNAL_LABELS)).filter(Boolean)))
    : [];

  const score = typeof raw.viralityScore === "number" ? clampScore(raw.viralityScore) : fallback.viralityScore;

  return {
    contentType: pickFromList(raw.contentType, CONTENT_TYPES),
    infoDensity: pickFromList(raw.infoDensity, INFO_DENSITIES),
    viralityScore: score,
    hitSignals,
    hookSentence: str(raw.hookSentence),
    // 不继承 fallback.reason：兜底文案写的是「未配置 AI…」，而能走到这里说明模型有返回，
    // 套用会让飞书里出现自相矛盾的说明。
    reason: str(raw.reason) || "模型未给出打分理由。",
    // 互动率来自真实数据，不接受模型覆盖
    engagementRate: fallback.engagementRate,
  };
}
