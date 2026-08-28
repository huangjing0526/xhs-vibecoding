/**
 * 可复刻性筛查：看着对标视频的关键帧，判断这条片子用 AI 生成到底做不做得出来。
 *
 * 存在的理由很实在——拆完节奏才发现「这是真人口播、对不了口型」，那前面的活儿全白干。
 * 所以这一步要在动手之前就把话说清楚，并且对每个卡住的镜头给出替代方案，而不是只报一句「做不了」。
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
  talking: "图生视频不做对口型，嘴型对不上口播",
  "fine-motion": "6 秒里主体形变一大就崩，手部操作尤其明显",
  identity: "跨镜靠提示词措辞对齐外貌，镜头越多越容易换脸",
  text: "生成模型写不准文字，得靠后期贴字",
  crowd: "人一多就糊脸、肢体错乱",
};

/**
 * 风险分两种，这个区分才是报告有没有用的关键。
 * 一条片子十有八九每镜都能挑出毛病，全标成红的等于没说——
 * 真正要拦住人的是「生成阶段就做不出来」，其余后期都能补。
 */
export type RiskSeverity = "block" | "workable";

export const RISK_SEVERITY: Record<ReplicabilityRisk, RiskSeverity> = {
  talking: "block",
  "fine-motion": "block",
  crowd: "block",
  identity: "workable",
  text: "workable",
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

export interface ReplicabilityReport {
  verdict: ReplicabilityVerdict;
  /** 一句话结论，说清为什么是这个档 */
  summary: string;
  shots: ShotRisk[];
  /** 跨镜复现的主体（人/产品）是谁，直接决定一致性难度 */
  recurringSubject: string;
  createdAt: string;
}

/** 送去看的关键帧上限：再多也只是重复信息，白烧 token。 */
const MAX_SCREEN_FRAMES = 12;

/** 帧多于上限时均匀抽样，保证首尾都在——开场和收尾恰恰是最该看的两处。 */
export function pickFramesToScreen(shots: BenchmarkShot[], max = MAX_SCREEN_FRAMES): BenchmarkShot[] {
  if (shots.length <= max) return shots;
  const step = (shots.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => shots[Math.round(index * step)]);
}

export function buildReplicabilityPrompt(shots: BenchmarkShot[]): string {
  // 只给图片序号，不给镜号：镜号可能是跳着的（帧多时会抽样），
  // 让模型做这层映射它会直接按图片顺序重编，风险就标到别的镜头上去了。映射放服务端做。
  const shotLines = shots.map((shot, index) => `图 ${index + 1}：${shot.durationSec} 秒`).join("\n");

  return `你在帮一个团队判断：这条对标视频，能不能用 AI 图生视频复刻出来。

上面这些图是从对标视频里按顺序抽的关键帧，每张对应一个镜头：
${shotLines}

【复刻用的引擎有这些硬边界】
- 做法是先生成一张静态首帧图，再让模型把这张图动起来。
- 每段最长 10 秒，没有尾帧控制，不能指定精确动作。
- 不做对口型：人物开口说话的镜头，嘴型和口播对不上。
- 画面里的文字生成不准。
- 跨镜头的同一个人/同一件产品，只能靠提示词措辞对齐外貌，镜头越多越容易变样。

【怎么判断】
逐图看画面里实际有什么，只标你真的看见的东西，看不清就不标。风险类型只能从这五个里选：
- talking：有人正对镜头开口说话
- fine-motion：连续的精细动作，尤其是手部操作
- identity：这一镜出现了在别的镜头里也出现的同一个人或同一件产品
- text：画面里有承载信息的文字（字幕条不算，商品包装上的字、屏幕截图里的字算）
- crowd：三个人以上或场面杂乱

有风险的镜头要给一句可执行的替代方案，比如「改成手部特写不出脸」「拆成两个静态镜头，动作留给转场」「文字后期贴上去」。没风险的镜头 risks 留空数组、workaround 留空字符串。

【同时要拆出「可替换的实体」】
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

整体结论三档：
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
      "risks": ["talking"],
      "what": "这一镜画面里是什么，一句话",
      "workaround": "卡住时怎么绕",
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

/** 看片一次回来的全部东西：风险报告、实体清单、逐镜内容。 */
export interface ScreeningResult {
  report: ReplicabilityReport;
  cast: BenchmarkCastEntity[];
  /** 键是真实镜号。没描述到的镜头不在表里，而不是给个空壳 */
  contentByOrder: Map<number, BenchmarkShotContent>;
}

/**
 * 收敛模型返回：把图片序号映射回真实镜号，认不出的风险类型直接丢掉。
 * screened 必须是送去看的那批镜头，顺序与图片一致——错位了整份报告就标到别的镜头上。
 */
export function normalizeReport(
  raw: { verdict?: unknown; summary?: unknown; recurringSubject?: unknown; shots?: unknown } | undefined,
  fallback: ReplicabilityReport,
  screened: BenchmarkShot[],
): ReplicabilityReport {
  if (!raw) return fallback;
  const verdict = (["easy", "doable", "hard"] as ReplicabilityVerdict[]).includes(raw.verdict as ReplicabilityVerdict)
    ? (raw.verdict as ReplicabilityVerdict)
    : "doable";
  const shots = (Array.isArray(raw.shots) ? raw.shots : []) as RawShotRisk[];

  return {
    verdict,
    summary: str(raw.summary) || fallback.summary,
    recurringSubject: str(raw.recurringSubject),
    shots: shots
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
      .filter((shot): shot is ShotRisk => Boolean(shot))
      .sort((a, b) => a.order - b.order),
    createdAt: new Date().toISOString(),
  };
}

/** 这一镜最重的那档风险；没风险返回 null。 */
export function shotSeverity(shot: ShotRisk): RiskSeverity | null {
  if (shot.risks.some((risk) => RISK_SEVERITY[risk] === "block")) return "block";
  return shot.risks.length ? "workable" : null;
}

/** 有风险的镜头，硬卡点排前面——那才是要先做决定的。 */
export function riskyShots(report: ReplicabilityReport): ShotRisk[] {
  return report.shots
    .filter((shot) => shot.risks.length > 0)
    .sort((a, b) => {
      const rank = (shot: ShotRisk) => (shotSeverity(shot) === "block" ? 0 : 1);
      return rank(a) - rank(b) || a.order - b.order;
    });
}

export interface RiskTally {
  /** 生成阶段就做不出来的镜头数 */
  blocked: number;
  /** 有毛病但后期能补的镜头数 */
  workable: number;
  clean: number;
}

export function tallyRisks(report: ReplicabilityReport): RiskTally {
  let blocked = 0;
  let workable = 0;
  let clean = 0;
  for (const shot of report.shots) {
    const severity = shotSeverity(shot);
    if (severity === "block") blocked += 1;
    else if (severity === "workable") workable += 1;
    else clean += 1;
  }
  return { blocked, workable, clean };
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
 * 看片一次，把风险、实体、逐镜内容一并收敛出来。
 *
 * 三样东西共用同一批帧，所以是一次调用的三份产物，不是三次调用。
 * screened 必须是送去看的那批镜头，顺序与图片一致——错位了整份结果都会挂到别的镜头上。
 */
export function normalizeScreening(
  raw: (Parameters<typeof normalizeReport>[0] & { cast?: unknown }) | undefined,
  fallback: ReplicabilityReport,
  screened: BenchmarkShot[],
): ScreeningResult {
  const report = normalizeReport(raw, fallback, screened);
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
  return { report, cast, contentByOrder };
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
