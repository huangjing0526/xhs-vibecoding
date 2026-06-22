import type { ContentCard, DraftNote } from "./xhsWorkflow";

/**
 * 发布前质检（阶段 A · 纯规则版）。
 *
 * 对齐工作流图「质检与发布兜底」的 5 个动作：
 * 事实一致 / 钩子重写 / 封面重做 / 标签重配 / 引导重写。
 *
 * 第一版全部走纯规则，不调 AI、不写回飞书——结果只在前端会话内有效。
 * 任一维判为 fail 即视为硬伤，拦截发布。
 */

export type QualityVerdict = "pass" | "warn" | "fail";
export type QualityDimension = "fact" | "hook" | "cover" | "tags" | "cta";
/** 修复动作落到哪：跳已有抽屉/页面，或在质检面板内联编辑。 */
export type QualityFixAction = "rewrite" | "cover" | "source" | "tags" | "cta" | "none";

export interface QualityIssue {
  dimension: QualityDimension;
  /** 中文维度名，直接展示 */
  label: string;
  verdict: QualityVerdict;
  /** 结论说明（用户可读） */
  message: string;
  /** 一句话怎么修 */
  fixHint: string;
  fixAction: QualityFixAction;
}

export interface QualityCheckResult {
  /** 始终 5 项，按 fact/hook/cover/tags/cta 顺序 */
  issues: QualityIssue[];
  failCount: number;
  warnCount: number;
  /** 有 fail 即拦截发布 */
  hardFail: boolean;
  /** 全部 pass */
  passed: boolean;
}

export interface QualityCheckInput {
  draft: DraftNote | null;
  topic: ContentCard | null;
  /** 封面是否已生成（dashboard 里的 coverDataUrl 是否有值） */
  coverReady: boolean;
}

const DIMENSION_LABEL: Record<QualityDimension, string> = {
  fact: "事实一致",
  hook: "钩子",
  cover: "封面",
  tags: "标签",
  cta: "引导",
};

/** 私域转化黑名单：评论引导命中即判硬伤（违反「只做真实讨论」原则） */
const CTA_BLACKLIST = /加微信|加我|私信|私聊|公众号|领取|扫码|进群|加群|vx|威信|主页|下单|购买|优惠|福利领|后台回复|链接见/i;
/** 钩子利益点词 */
const HOOK_BENEFIT = /免费|一键|秒|0基础|零基础|必看|收藏|私藏|保姆|手把手|清单|模板|避坑|踩坑|实测|亲测|超全|干货/;
/** 钩子反差/悬念词 */
const HOOK_CONTRAST = /反而|结果|没想到|居然|竟然|别再|原来|终于|不是.*而是|从.*到|越.*越/;
/** 疑问信号 */
const QUESTION_SIGNAL = /[?？]|怎么|为什么|如何|是不是|为何|凭什么|该不该|有没有|吗$/;

/** 从文本里抽「可比对的硬术语」：ASCII 词（专有名词/技术名）+ 长度≥2 */
function extractAsciiTerms(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[A-Za-z][A-Za-z0-9.+#_-]{1,}/g) || [];
  return Array.from(new Set(matches.map((w) => w.toLowerCase())));
}

/** 抽数字（含百分号），忽略孤立单数字以降噪 */
function extractNumbers(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\d+(?:\.\d+)?%?/g) || [];
  return matches.filter((n) => n.includes("%") || n.replace(/[^\d]/g, "").length >= 2);
}

/** 拆分主题里登记的相关术语 */
function splitTerms(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[、,，;；/\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function checkFact(draft: DraftNote, topic: ContentCard | null): QualityIssue {
  const base = { dimension: "fact" as const, label: DIMENSION_LABEL.fact, fixAction: "source" as const };
  const draftText = `${draft.title} ${draft.coverText} ${draft.content}`;
  const draftLower = draftText.toLowerCase();
  const sourceText = [topic?.sourceMaterial, topic?.realCase, topic?.coreViewpoint, topic?.relatedTerm]
    .filter(Boolean)
    .join(" ");

  // 待比对术语：来源里的硬术语 + 登记的相关术语
  const keyTerms = Array.from(
    new Set([...extractAsciiTerms(sourceText), ...splitTerms(topic?.relatedTerm || "")])
  );
  // 一次遍历分流出命中/未命中，避免二次 includes 扫描
  const covered: string[] = [];
  const missing: string[] = [];
  for (const term of keyTerms) {
    (draftLower.includes(term.toLowerCase()) ? covered : missing).push(term);
  }
  const coverage = keyTerms.length ? covered.length / keyTerms.length : 1;

  // 正文里出现、来源里没有的数字 → 可能是无据发挥
  const sourceNums = new Set(extractNumbers(sourceText));
  const unsourcedNums = extractNumbers(draftText).filter((n) => !sourceNums.has(n));

  if (keyTerms.length === 0) {
    if (unsourcedNums.length > 0) {
      return {
        ...base,
        verdict: "warn",
        message: `正文出现来源中没有的数字（${unsourcedNums.slice(0, 3).join("、")}），规则无法核对。`,
        fixHint: "回素材库确认这些数字是否真实，避免无据发挥。",
      };
    }
    return {
      ...base,
      verdict: "pass",
      message: "来源无可比对术语，规则未发现明显偏离（建议人工再看一眼）。",
      fixHint: "纯规则覆盖有限，关键事实仍以人工核对为准。",
    };
  }

  if (coverage < 0.3) {
    return {
      ...base,
      verdict: "fail",
      message: `正文几乎没覆盖来源关键术语（命中 ${covered.length}/${keyTerms.length}），可能偏离素材。`,
      fixHint: `回素材库对照来源，确认是否漏了：${missing.slice(0, 4).join("、")}。`,
    };
  }
  if (coverage < 0.6 || unsourcedNums.length > 0) {
    const reasons: string[] = [];
    if (coverage < 0.6) reasons.push(`关键术语命中偏低（${covered.length}/${keyTerms.length}）`);
    if (unsourcedNums.length > 0) reasons.push(`出现来源外数字（${unsourcedNums.slice(0, 3).join("、")}）`);
    return {
      ...base,
      verdict: "warn",
      message: reasons.join("；") + "。",
      fixHint: "回素材库核对，确保正文主张都有来源支撑。",
    };
  }
  return {
    ...base,
    verdict: "pass",
    message: `正文覆盖了来源关键术语（${covered.length}/${keyTerms.length}），未见明显偏离。`,
    fixHint: "事实层规则检查通过。",
  };
}

function checkHook(draft: DraftNote): QualityIssue {
  const base = { dimension: "hook" as const, label: DIMENSION_LABEL.hook, fixAction: "rewrite" as const };
  const title = draft.title.trim();
  if (!title) {
    return { ...base, verdict: "fail", message: "标题为空。", fixHint: "进改写抽屉先定一个钩子标题。" };
  }

  const signals: string[] = [];
  if (/\d/.test(title)) signals.push("数字");
  if (QUESTION_SIGNAL.test(title)) signals.push("提问");
  if (HOOK_CONTRAST.test(title)) signals.push("反差");
  if (HOOK_BENEFIT.test(title)) signals.push("利益点");

  const len = title.length;
  const lenNote = len < 6 ? "标题偏短" : len > 26 ? "标题偏长" : "";

  if (signals.length === 0) {
    return {
      ...base,
      verdict: "fail",
      message: `标题缺少钩子（无数字/提问/反差/利益点）${lenNote ? "，且" + lenNote : ""}。`,
      fixHint: "用「更像爆款」改写标题，至少加一个钩子要素。",
    };
  }
  if (signals.length === 1 || lenNote) {
    return {
      ...base,
      verdict: "warn",
      message: `钩子较弱（命中：${signals.join("、")}）${lenNote ? "，" + lenNote : ""}。`,
      fixHint: "再加一个钩子要素，或调整到 8–24 字。",
    };
  }
  return {
    ...base,
    verdict: "pass",
    message: `钩子到位（命中：${signals.join("、")}）。`,
    fixHint: "标题钩子检查通过。",
  };
}

function checkCover(draft: DraftNote, coverReady: boolean): QualityIssue {
  const base = { dimension: "cover" as const, label: DIMENSION_LABEL.cover, fixAction: "cover" as const };
  if (!coverReady) {
    return { ...base, verdict: "fail", message: "还没有生成封面。", fixHint: "进封面抽屉生成一张 3:4 封面。" };
  }
  if (!draft.coverText.trim()) {
    return {
      ...base,
      verdict: "warn",
      message: "封面已生成，但封面文案为空。",
      fixHint: "补一句封面文案，让封面信息更完整。",
    };
  }
  return { ...base, verdict: "pass", message: "封面已生成且有文案。", fixHint: "封面检查通过。" };
}

function checkTags(draft: DraftNote): QualityIssue {
  const base = { dimension: "tags" as const, label: DIMENSION_LABEL.tags, fixAction: "tags" as const };
  const tags = draft.tags.filter(Boolean);
  const count = tags.length;
  // 精准长尾：去掉 # 后长度≥4 视为精准标签
  const hasPrecise = tags.some((t) => t.replace(/^#/, "").length >= 4);

  if (count <= 2) {
    return {
      ...base,
      verdict: "fail",
      message: `标签太少（当前 ${count} 个，建议 4–8 个，大流量+精准搭配）。`,
      fixHint: "在下方补齐标签，至少 4 个。",
    };
  }
  if (count > 12) {
    return { ...base, verdict: "warn", message: `标签偏多（${count} 个），易稀释精准度。`, fixHint: "精简到 8 个以内。" };
  }
  if (!hasPrecise) {
    return {
      ...base,
      verdict: "warn",
      message: "缺少精准长尾标签，可能只命中泛流量。",
      fixHint: "加 1–2 个更具体的长尾标签。",
    };
  }
  return { ...base, verdict: "pass", message: `标签搭配合理（${count} 个，含精准长尾）。`, fixHint: "标签检查通过。" };
}

function checkCta(draft: DraftNote): QualityIssue {
  const base = { dimension: "cta" as const, label: DIMENSION_LABEL.cta, fixAction: "cta" as const };
  const cta = draft.commentPrompt.trim();
  if (!cta) {
    return { ...base, verdict: "fail", message: "没有评论引导。", fixHint: "在下方补一个真实讨论问题。" };
  }
  if (CTA_BLACKLIST.test(cta)) {
    return {
      ...base,
      verdict: "fail",
      message: "引导含私域转化/导流，违反「只做真实讨论」原则。",
      fixHint: "改成一个开放的真实讨论问题，去掉导流话术。",
    };
  }
  if (!QUESTION_SIGNAL.test(cta)) {
    return {
      ...base,
      verdict: "warn",
      message: "引导不像一个真实提问，互动效果可能有限。",
      fixHint: "改写成一个能让读者回答的问题。",
    };
  }
  return { ...base, verdict: "pass", message: "引导是真实讨论问题。", fixHint: "评论引导检查通过。" };
}

export function runQualityCheck(input: QualityCheckInput): QualityCheckResult {
  const { draft, topic, coverReady } = input;

  // 没草稿无从质检：5 维全部标 fail，引导先生成草稿
  if (!draft) {
    const issues: QualityIssue[] = (Object.keys(DIMENSION_LABEL) as QualityDimension[]).map((dimension) => ({
      dimension,
      label: DIMENSION_LABEL[dimension],
      verdict: "fail" as const,
      message: "还没有草稿。",
      fixHint: "先在中栏生成草稿，再回来质检。",
      fixAction: "none" as const,
    }));
    return { issues, failCount: issues.length, warnCount: 0, hardFail: true, passed: false };
  }

  const issues: QualityIssue[] = [
    checkFact(draft, topic),
    checkHook(draft),
    checkCover(draft, coverReady),
    checkTags(draft),
    checkCta(draft),
  ];

  const failCount = issues.filter((i) => i.verdict === "fail").length;
  const warnCount = issues.filter((i) => i.verdict === "warn").length;
  return {
    issues,
    failCount,
    warnCount,
    hardFail: failCount > 0,
    passed: failCount === 0 && warnCount === 0,
  };
}

export interface QualitySummary {
  /** 语义色，由消费方各自映射到自己的 className */
  tone: "ok" | "warn" | "fail" | "muted";
  /** 短标签，给状态徽章 */
  shortLabel: string;
  /** 一句话结论 */
  summary: string;
}

/**
 * 把质检结果汇总成展示用文案 + 语义色。
 * 收口在领域层，避免 NoteInspector 和 QualityGate 各翻译一遍口径漂移。
 */
export function summarizeQuality(result: QualityCheckResult | null, hasDraft: boolean): QualitySummary {
  if (!hasDraft || !result) {
    return { tone: "muted", shortLabel: "待生成", summary: "先生成草稿，再做发布前质检。" };
  }
  if (result.passed) {
    return { tone: "ok", shortLabel: "已通过", summary: "5 项发布前检查全部通过，可以发布。" };
  }
  if (result.hardFail) {
    return {
      tone: "fail",
      shortLabel: `${result.failCount} 项硬伤`,
      summary: `事实一致 / 钩子 / 封面 / 标签 / 引导中有 ${result.failCount} 项不过，处理后才能发布。`,
    };
  }
  return {
    tone: "warn",
    shortLabel: `${result.warnCount} 项提醒`,
    summary: `有 ${result.warnCount} 项提醒，建议处理后再发布。`,
  };
}
