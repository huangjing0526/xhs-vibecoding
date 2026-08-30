/**
 * 可复刻性筛查：看着对标视频的关键帧，判断这条片子的每一镜该走哪条通道做出来。
 *
 * 存在的理由很实在——拆完节奏才发现「这是真人口播、对不了口型」，那前面的活儿全白干。
 * 所以这一步要在动手之前就把话说清楚。
 *
 * 从「做不做得出来」改成「走哪条通道」，是因为复刻不再只有图生视频一条路：
 * 接上视频编辑通道之后，「连续精细动作」这类原本判死刑的镜头，
 * 保留原片运动、只换主体就能过。二分法会把一半能做的镜头拦在门外。
 *
 * 看片分成两趟，因为这两件事的覆盖面要求不一样：
 * - **路线**（buildRoutePrompt）走全量，分批送。漏判一镜的代价是分镜表把该切片编辑的
 *   镜头当成能直接生成的，后面整段活儿白干。
 * - **内容**（buildContentPrompt）守 12 帧上限。四段画面描述是重活儿，而它漏掉的镜头
 *   会明确标成 undescribed，下游知道那几镜没底稿。
 * 合成一趟的代价是路线跟着内容一起被抽样卡死：34 镜的片子只有 12 镜判过路线。
 */

import {
  CAST_KIND_LABEL,
  castToken,
  parseCastToken,
  usedCastTokens,
  type BenchmarkCastEntity,
  type BenchmarkCastKind,
  type BenchmarkShot,
  type BenchmarkShotContent,
} from "./benchmark";

/**
 * 卡住 AI 复刻的几类画面。
 * 这几类不是拍脑袋列的，是图生视频引擎的硬边界：每镜最长 10 秒、无尾帧、不控精确动作、不对口型。
 */
export type ReplicabilityRisk = "talking" | "fine-motion" | "identity" | "text" | "crowd";

export const RISK_LABEL: Record<ReplicabilityRisk, string> = {
  talking: "真人开口说话",
  "fine-motion": "连续精细动作",
  identity: "同一主体跨镜",
  text: "画面内关键文字",
  crowd: "复杂多人场景",
};

export const RISK_WHY: Record<ReplicabilityRisk, string> = {
  talking: "换得了人换不了口型：走编辑通道之后还欠一道对口型",
  "fine-motion": "从零生成会崩，手部操作尤其明显；保留原片运动只换主体就能过",
  identity: "编辑通道下同一张参考图贯穿全片，不再是卡点",
  text: "生成模型写不准文字，得靠后期贴字",
  crowd: "从零生成人一多就糊脸；保留原片人群、只换前景那一位",
};

/**
 * 一镜怎么做出来。
 *
 * 这是三条通道，不是三个严重度——报告的用处是「这镜该怎么做」，不是「这镜有多糟」。
 * 一条片子十有八九每镜都能挑出毛病，按毛病轻重排等于没说。
 */
/**
 * 一镜额外要做的工序。空集就是「直接生成」——什么额外的活儿都没有。
 *
 * 为什么是集合而不是单值：这些工序是并列的，不是三选一。
 * 一镜既有精细动作又有包装文字，就是既要切片编辑、又要后期贴字。
 * 压成一个赢家的话，「还得贴字」这件真实待办会凭空消失在统计里。
 */
export type ShotStep = "edit" | "postfix" | "lipsync";

export const STEP_LABEL: Record<ShotStep, string> = {
  edit: "切片去编辑",
  postfix: "后期贴字",
  lipsync: "补对口型",
};

export const STEP_WHY: Record<ShotStep, string> = {
  edit: "保留对标这一镜的原运动和构图，用视频编辑模型把主体换掉",
  postfix: "画面能生成，文字后期贴上去",
  lipsync: "编辑模型换得了人，口型还是原片说原话时的口型，要说自己的词得再补一道",
};

/** 固定的展示顺序，也是「主路线」取哪个的优先级。 */
const STEP_ORDER: ShotStep[] = ["edit", "postfix", "lipsync"];

export const RISK_STEPS: Record<ReplicabilityRisk, ShotStep[]> = {
  // 说话镜换得了人换不了口型，所以是两道工序，不是一道
  talking: ["edit", "lipsync"],
  "fine-motion": ["edit"],
  crowd: ["edit"],
  // 编辑通道下同一张参考图贯穿全片，这条风险不再产生额外工序
  identity: [],
  text: ["postfix"],
};

/** 这一镜要做的全部额外工序，去重并按固定顺序排。 */
export function shotSteps(shot: ShotRisk): ShotStep[] {
  const steps = new Set(shot.risks.flatMap((risk) => RISK_STEPS[risk]));
  return STEP_ORDER.filter((step) => steps.has(step));
}

/**
 * 这一镜的主路线，给界面上「这镜怎么做」一句话用。
 *
 * 是 shotSteps 的派生视图，不是另一套判据——展示要一句话，统计要全集，
 * 各取所需但只有一个真相来源。
 */
export type ShotRoute = "generate" | "edit" | "postfix";

export const ROUTE_LABEL: Record<ShotRoute, string> = {
  generate: "直接生成",
  edit: "切片去编辑",
  postfix: "生成 + 后期",
};

export const ROUTE_WHY: Record<ShotRoute, string> = {
  generate: "图生视频从零做，主体换成自己的素材",
  edit: STEP_WHY.edit,
  postfix: STEP_WHY.postfix,
};

export interface ShotRisk {
  order: number;
  risks: ReplicabilityRisk[];
  /** 这一镜画面里是什么，一句话 */
  what: string;
  /** 卡住时怎么绕过去；没风险就留空 */
  workaround: string;
}

/** 整条片子的结论：能不能做、难在哪。 */
export type ReplicabilityVerdict = "easy" | "doable" | "hard";

export const VERDICT_LABEL: Record<ReplicabilityVerdict, string> = {
  easy: "好复刻",
  doable: "能做，有几处要绕",
  hard: "不建议照搬",
};

/**
 * 这一镜为什么没判出路线。
 *
 * 和结构量化的 MetricUnavailable 同一条规矩：判不了就说清为什么，绝不给一个假的绿灯——
 * 把没判过的镜头默默算进「直接生成」，人就会照着一份缺角的清单去动手。
 */
export type RouteUnavailable =
  | "no-frame"     // 这一镜没抽到关键帧，压根没进过任何一批
  | "batch-failed" // 它所在那一批调用失败了
  | "not-sampled"; // 老报告：那时路线还跟着内容一起守 12 帧抽样上限

export const ROUTE_UNAVAILABLE_LABEL: Record<RouteUnavailable, string> = {
  "no-frame": "没抽到关键帧",
  "batch-failed": "判路线时模型没回话",
  "not-sampled": "旧报告只判了抽样到的那几镜",
};

export interface UnroutedShot {
  order: number;
  reason: RouteUnavailable;
}

export interface ReplicabilityReport {
  verdict: ReplicabilityVerdict;
  /** 一句话结论，说清为什么是这个档 */
  summary: string;
  shots: ShotRisk[];
  /** 跨镜复现的主体（人/产品）是谁，直接决定一致性难度 */
  recurringSubject: string;
  createdAt: string;
  /**
   * 没判出路线的镜头及原因。全判出来了就没有这一项。
   *
   * 由唯一知道原因的看片流程写进来，界面直接读——
   * 靠 `rhythm.shots.length - report.shots.length` 反推只能得到一个不带原因的数字，
   * 而「没抽到帧」和「模型没回话」这两件事，处置办法完全不同。
   */
  unrouted?: UnroutedShot[];
}

/**
 * 送去写画面描述的关键帧上限：再多也只是重复信息，白烧 token。
 * 只管内容那一趟——路线那一趟走全量，见 chunkShotsForRoute。
 */
const MAX_SCREEN_FRAMES = 12;

/** 帧多于上限时均匀抽样，保证首尾都在——开场和收尾恰恰是最该看的两处。 */
export function pickFramesToScreen(shots: BenchmarkShot[], max = MAX_SCREEN_FRAMES): BenchmarkShot[] {
  if (shots.length <= max) return shots;
  const step = (shots.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => shots[Math.round(index * step)]);
}

/**
 * 一批送去判路线的帧数上限。
 *
 * 分批而不是一次全送：几十张图的单次请求既慢又容易被截断成半条 JSON，
 * 而截断一次就等于这条片子全部镜头都没判过。
 *
 * 分批是安全的，因为真正决定工序的四类风险（talking / fine-motion / text / crowd）
 * 全都看单帧就能判。唯一跨镜的 identity 不产生任何工序（见 RISK_STEPS），
 * 所以一批看不到全片，也不可能把工序判错。
 * 真正需要通盘看的判断——实体清单、跨镜主体、整片结论——留在内容那一趟，
 * 它送的是全片的均匀切片，视野比任何一批都宽。
 */
export const ROUTE_BATCH_SIZE = 12;

/** 全量镜头切成若干批，顺序不打乱——批内的图片序号要映射回镜号。 */
export function chunkShotsForRoute(shots: BenchmarkShot[], size = ROUTE_BATCH_SIZE): BenchmarkShot[][] {
  const batches: BenchmarkShot[][] = [];
  for (let at = 0; at < shots.length; at += size) batches.push(shots.slice(at, at + size));
  return batches;
}

/**
 * 判路线的提示词。只问风险，不问画面内容也不问实体——
 * 这一趟要跑全量，每多问一样东西就要在每一批上再付一遍。
 */
/**
 * 送去看的那叠图写成清单。
 *
 * 只给图片序号，不给镜号：镜号是跳着的（内容那一趟是抽样的，路线那一趟每批都从 1 数起），
 * 让模型做这层映射它会直接按图片顺序重编，结论就标到别的镜头上去了。映射放服务端做。
 *
 * 两个提示词共用这一份，因为「图 N 对应 screened[N-1]」这条契约两边的收敛函数都指着它——
 * 各写各的，迟早有一边改了措辞而另一边的映射没跟上。
 */
function framedShotIndex(shots: BenchmarkShot[]): string {
  const lines = shots.map((shot, index) => `图 ${index + 1}：${shot.durationSec} 秒`).join("\n");
  return `上面这些图是从对标视频里按顺序抽的关键帧，每张对应一个镜头：\n${lines}`;
}

export function buildRoutePrompt(shots: BenchmarkShot[]): string {
  return `你在帮一个团队判断：这条对标视频的每一镜，该用哪种做法复刻出来。

${framedShotIndex(shots)}

【复刻有两条通道】
- 通道 A 从零生成：先生成一张静态首帧图，再让模型把这张图动起来。
  每段最长 10 秒，没有尾帧控制，不能指定精确动作，不做对口型，画面里的文字生成不准。
- 通道 B 切片编辑：把对标这一镜的原片段送进视频编辑模型，运动、构图、光线原样保留，
  只把画面里的人和货换成用户自己的。动作再精细也不会崩，但口型仍然是原片的。

你不用决定走哪条——如实标出风险就行，走哪条由后面的规则算。

【怎么判断】
逐图看画面里实际有什么，只标你真的看见的东西，看不清就不标。风险类型只能从这五个里选：
- talking：有人正对镜头开口说话
- fine-motion：连续的精细动作，尤其是手部操作
- identity：这一镜里的人或产品，在上面这批图的别的图里也出现过
- text：画面里有承载信息的文字（字幕条不算，商品包装上的字、屏幕截图里的字算）
- crowd：三个人以上或场面杂乱

有风险的镜头给一句可执行的提示：要保住这一镜原本的效果，动手时得注意什么。
比如「手和产品的接触点要拍清楚，换货时才对得上」「人群留在背景里，只换前景这一位」「文字后期贴上去」。
没风险的镜头 risks 留空数组、workaround 留空字符串。

what 用中文写这一镜画面里是什么，一句话。

只返回 JSON，不要解释。image 必须是上面的图片序号，每张图一条，不要漏也不要多。格式：
{
  "shots": [
    {
      "image": 1,
      "risks": ["talking"],
      "what": "这一镜画面里是什么，一句话",
      "workaround": "卡住时怎么绕；没风险就留空字符串"
    }
  ]
}`;
}

/**
 * 拆实体与逐镜画面的提示词。这一趟重，所以守 12 帧上限（见 MAX_SCREEN_FRAMES）。
 * 整片结论也在这一趟出——它要通盘看，而这一趟送的正是全片的均匀切片。
 */
export function buildContentPrompt(shots: BenchmarkShot[]): string {
  return `你在帮一个团队把一条对标视频拆成「换掉素材就能重做一遍」的底稿。

${framedShotIndex(shots)}

【要拆出「可替换的实体」】
这些图会被用来复刻：结构、构图、光线照抄，但里面的人、货、地方要换成用户自己的。
所以先跨图认一遍：这条片子里反复出现的人、产品、场景各有几个。同一个人在多张图里出现，只算一个实体。

- token 必须严格是「角色1」「角色2」「产品1」「产品2」「场景1」这种形状：三个词之一 + 一位数字，同类从 1 开始连着编。别的写法一律作废。
- label 只写类型和结构，例如「女性模特」「白色长袖衬衫」「室内浅色走廊」。
  不要写到能认出具体是谁、具体是哪个品牌哪件商品——用户要换成自己的东西，写死了反而没法换。
- images 填这个实体出现在哪几张图，用图片序号。

【每张图还要写清画面内容】
写到照着它就能重新生成一张同构画面的程度，分四段：
- subject：主体在做什么。**画面里的人、产品、场景，一律用上面的 token 加花括号代替**，例如「{角色1} 站定后转身，双手整理 {产品1} 的领口」。
- framing：景别加构图，例如「中景，居中构图，人物占画面约三分之一宽」。
- light：光线和色调，例如「自然光，冷白色调，无明显补光」。
- scene：场景元素，场景主体同样用花括号 token，例如「{场景1}，浅色墙面，右侧一扇木门」。

framing 和 light 里不要出现花括号——那两段描述的是拍法，不是被替换的东西。
只写你真看见的，看不清的那一段留空字符串，不要编。
label 和这四段全部用中文写，一个英文单词都不要夹——这些描述会原样进下游的画图提示词，
中英混写会让生图模型把英文词当成要画进画面的文字。

【最后给整条片子一个结论】
照着这条复刻，难在哪。三档：
- easy：几乎没有卡点，照着做就行
- doable：能做，但有几处要绕
- hard：核心镜头就卡住了，不建议照搬这条的画面，只借节奏

只返回 JSON，不要解释。image 必须是上面的图片序号，每张图一条，不要漏也不要多。格式：
{
  "verdict": "easy | doable | hard",
  "summary": "一句话结论，说清为什么是这一档",
  "recurringSubject": "跨镜反复出现的人或产品是什么；没有就写「无」",
  "cast": [
    { "token": "角色1", "label": "女性模特", "images": [1, 2, 4] },
    { "token": "产品1", "label": "白色长袖衬衫", "images": [1, 2] },
    { "token": "场景1", "label": "室内浅色走廊", "images": [1, 2] }
  ],
  "shots": [
    {
      "image": 1,
      "content": {
        "subject": "{角色1} 站定后转身，双手整理 {产品1} 的领口",
        "framing": "中景，居中构图，人物占画面约三分之一宽",
        "light": "自然光，冷白色调，无明显补光",
        "scene": "{场景1}，浅色墙面，右侧一扇木门"
      }
    }
  ]
}`;
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const RISK_KEYS = Object.keys(RISK_LABEL) as ReplicabilityRisk[];

export function createFallbackReport(): ReplicabilityReport {
  return {
    verdict: "doable",
    summary: "未配置 AI，没法看画面，能不能复刻请自己对着关键帧判断。",
    shots: [],
    recurringSubject: "",
    createdAt: new Date().toISOString(),
  };
}

/** 模型按图片序号回话，这是它的原始形状。 */
interface RawShotRisk {
  image?: unknown;
  risks?: unknown;
  what?: unknown;
  workaround?: unknown;
  content?: unknown;
}

/** 模型给的实体条目，images 是图片序号不是镜号。 */
interface RawCastEntity {
  token?: unknown;
  label?: unknown;
  images?: unknown;
}

/** 内容那一趟回来的东西：整片结论、实体清单、逐镜画面。逐镜风险不在这里，见 normalizeRoutes。 */
export interface ScreeningResult {
  verdict: ReplicabilityVerdict;
  summary: string;
  recurringSubject: string;
  cast: BenchmarkCastEntity[];
  /** 键是真实镜号。没描述到的镜头不在表里，而不是给个空壳 */
  contentByOrder: Map<number, BenchmarkShotContent>;
}

/**
 * 收敛路线那一趟的返回：把图片序号映射回真实镜号，认不出的风险类型直接丢掉。
 *
 * screened 必须是**这一批**送去看的镜头，顺序与图片一致——每批的图片序号都从 1 数起，
 * 拿全片的镜头表来映射会把第二批往后的结论整体错位到片头那几镜上。
 * 不在这里排序：调用方要先把各批合起来再排，各批各排等于没排。
 */
export function normalizeRoutes(
  raw: { shots?: unknown } | undefined,
  screened: BenchmarkShot[],
): ShotRisk[] {
  const shots = (Array.isArray(raw?.shots) ? raw.shots : []) as RawShotRisk[];
  return shots
    .map((shot) => {
      const index = Number(shot.image) - 1;
      const source = screened[index];
      // 序号超范围说明模型编了张不存在的图，整条丢掉好过标错镜头
      if (!source) return null;
      return {
        order: source.order,
        risks: (Array.isArray(shot.risks) ? shot.risks : []).filter((risk): risk is ReplicabilityRisk =>
          RISK_KEYS.includes(risk as ReplicabilityRisk),
        ),
        what: str(shot.what),
        workaround: str(shot.workaround),
      };
    })
    .filter((shot): shot is ShotRisk => Boolean(shot));
}

export function shotRoute(shot: ShotRisk): ShotRoute {
  const steps = shotSteps(shot);
  if (steps.includes("edit")) return "edit";
  if (steps.includes("postfix")) return "postfix";
  return "generate";
}

/** 有风险的镜头，要切片的排前面——那批要先决定原片能不能用。 */
export function riskyShots(report: ReplicabilityReport): ShotRisk[] {
  const rank = (shot: ShotRisk) => (shotSteps(shot).includes("edit") ? 0 : 1);
  return report.shots
    .filter((shot) => shot.risks.length > 0)
    .sort((a, b) => rank(a) - rank(b) || a.order - b.order);
}

/**
 * 每道工序各有多少镜。
 *
 * 各项**不互斥**：一镜既要切片又要贴字，两边都会计上，只有 generate 是「一道额外工序都没有」。
 * 早先按单一路线计数会让后者吞掉前者，界面上「要贴字的」就少报了。
 */
export interface StepTally extends Record<ShotStep, number> {
  generate: number;
}

export function tallySteps(report: ReplicabilityReport): StepTally {
  const tally: StepTally = { generate: 0, edit: 0, postfix: 0, lipsync: 0 };
  for (const shot of report.shots) {
    const steps = shotSteps(shot);
    if (!steps.length) tally.generate += 1;
    for (const step of steps) tally[step] += 1;
  }
  return tally;
}

/**
 * 要切原片下来才做得了的镜号。
 * 拆片时按它切 clip，不是每镜都切——切了也用不上，白占地方。
 */
export function clipShotOrders(report: ReplicabilityReport): number[] {
  return report.shots.filter((shot) => shotSteps(shot).includes("edit")).map((shot) => shot.order);
}

/**
 * 逐镜的主路线。
 * 界面和切片器共用这一份，省得同一件事在四个地方各推一遍；
 * 没看过片时全是「直接生成」——没有判据就不该假装有结论。
 */
export function routeByShot(report: ReplicabilityReport | undefined): Map<number, ShotRoute> {
  const out = new Map<number, ShotRoute>();
  for (const shot of report?.shots || []) out.set(shot.order, shotRoute(shot));
  return out;
}

/**
 * 收敛实体清单。
 *
 * images 是图片序号，必须在这里映射回镜号——模型手上只有一叠图，
 * 它没有能力也没有动机去维护一份跳号的镜号系统（帧多时是抽样的）。
 * 同样地，编号由模型定、这里只做校验不重编：描述里的 {角色1} 是它同一次写下的，
 * 服务端一改号，那些占位符全成了对不上的孤儿。
 */
function normalizeCast(raw: unknown, screened: BenchmarkShot[]): BenchmarkCastEntity[] {
  const items = (Array.isArray(raw) ? raw : []) as RawCastEntity[];
  const byToken = new Map<string, BenchmarkCastEntity>();
  for (const item of items) {
    const parsed = parseCastToken(str(item.token));
    const label = str(item.label);
    // token 形状不对或没说清是什么，这条就没法用来替换，丢掉好过留个残条目
    if (!parsed || !label) continue;
    const token = castToken(parsed);
    if (byToken.has(token)) continue;
    const shots = (Array.isArray(item.images) ? item.images : [])
      .map((value) => screened[Number(value) - 1]?.order)
      .filter((order): order is number => typeof order === "number");
    byToken.set(token, { ...parsed, label, shots: [...new Set(shots)].sort((a, b) => a - b) });
  }
  // 按角色→产品→场景排，和界面上那三个槽位一个顺序。
  // 按 kind 的字母序排会把「产品1」摆到「角色1」前面，读起来像清单乱了
  const order: BenchmarkCastKind[] = ["role", "product", "scene"];
  return [...byToken.values()].sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.index - b.index,
  );
}

/**
 * 收敛一镜的画面内容。
 *
 * 清单外的占位符直接脱掉花括号：它指向一个不存在的实体，永远换不掉，
 * 留着只会让 {角色3} 这种记号原样漏进首帧提示词，模型会真把括号画进画面。
 * framing 和 light 里的花括号一律脱掉——那两段描述的是拍法，本来就不该有可替换的东西。
 */
function normalizeContent(raw: unknown, known: Set<string>): BenchmarkShotContent | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const keep = (text: string) =>
    text.replace(/\{([^{}]+)\}/g, (whole, token: string) =>
      known.has(token.trim()) ? whole : token.trim(),
    );
  const strip = (text: string) => text.replace(/\{([^{}]+)\}/g, (_, token: string) => token.trim());

  const content: BenchmarkShotContent = {
    subject: keep(str(source.subject)),
    framing: strip(str(source.framing)),
    light: strip(str(source.light)),
    scene: keep(str(source.scene)),
  };
  // 四段全空说明这一镜它其实没看清，别存个空壳假装描述过了
  return content.subject || content.framing || content.light || content.scene ? content : null;
}

/**
 * 收敛内容那一趟：整片结论、实体清单、逐镜画面。
 *
 * 实体和逐镜画面必须同一次调用回来，因为描述里的 {角色1} 是模型在写这份实体清单时
 * 一起写下的——分两次要，第二次它会重新编号，占位符就全成了孤儿。
 * screened 必须是送去看的那批镜头，顺序与图片一致——错位了整份结果都会挂到别的镜头上。
 */
export function normalizeScreening(
  raw:
    | { verdict?: unknown; summary?: unknown; recurringSubject?: unknown; cast?: unknown; shots?: unknown }
    | undefined,
  fallback: Pick<ReplicabilityReport, "verdict" | "summary">,
  screened: BenchmarkShot[],
): ScreeningResult {
  const verdict = (["easy", "doable", "hard"] as ReplicabilityVerdict[]).includes(
    raw?.verdict as ReplicabilityVerdict,
  )
    ? (raw?.verdict as ReplicabilityVerdict)
    : fallback.verdict;
  const cast = normalizeCast(raw?.cast, screened);
  const known = new Set(cast.map((entity) => castToken(entity)));

  const contentByOrder = new Map<number, BenchmarkShotContent>();
  const shots = (Array.isArray(raw?.shots) ? raw.shots : []) as RawShotRisk[];
  for (const shot of shots) {
    const source = screened[Number(shot.image) - 1];
    if (!source) continue;
    const content = normalizeContent(shot.content, known);
    if (content) contentByOrder.set(source.order, content);
  }
  return {
    verdict,
    summary: str(raw?.summary) || fallback.summary,
    recurringSubject: str(raw?.recurringSubject),
    cast,
    contentByOrder,
  };
}

/**
 * 实体清单里没被任何一镜描述引用到的那些。
 * 模型偶尔会列出一个实体却从不在描述里用它——这种实体绑了素材也换不到任何地方，
 * 界面上得说清楚，不然人会以为绑了就生效了。
 */
export function unusedCastTokens(
  cast: BenchmarkCastEntity[],
  contents: BenchmarkShotContent[],
): string[] {
  const used = new Set(contents.flatMap((content) => usedCastTokens(content)));
  return cast.map((entity) => castToken(entity)).filter((token) => !used.has(token));
}

/** 三类实体各有几个，界面上一行说清这条片子要换几样东西。 */
export function describeCast(cast: BenchmarkCastEntity[]): string {
  const counts = new Map<string, number>();
  for (const entity of cast) {
    const label = CAST_KIND_LABEL[entity.kind];
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => `${count} 个${label}`).join(" · ");
}
