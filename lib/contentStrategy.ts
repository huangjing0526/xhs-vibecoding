import type {
  AssetType,
  ContentCard,
  ContentLane,
  DraftNote,
  HookType,
  ReferencePool,
  ViralBodyStructure,
  ViralTitleStructure,
} from "./xhsWorkflow";

export const CONTENT_LANE_LABEL: Record<ContentLane, string> = {
  "work-situation": "职场高频尴尬",
  "learning-growth": "学习成长",
  "ai-radar": "AI Radar",
  cashflow: "现金流观察",
  "safety-pitfall": "安全避坑",
  "life-family": "生活家庭",
};

export const REFERENCE_POOL_LABEL: Record<ReferencePool, string> = {
  "trend-radar": "趋势雷达",
  "tool-hands-on": "工具实操",
  "workflow-system": "工作流系统",
  "learning-path": "学习路径",
};

export const TITLE_STRUCTURE_LABEL: Record<ViralTitleStructure, string> = {
  "pain-solved": "痛点解决型",
  "before-after": "前后对比型",
  "ordinary-growth": "普通人成长型",
  "workflow-reveal": "工作流揭秘型",
  "result-demo": "成品展示型",
  "curiosity-opportunity": "好奇机会型",
};

export const BODY_STRUCTURE_LABEL: Record<ViralBodyStructure, string> = {
  "story-method-asset": "亲历故事 + 方法 + 资产",
  "mistake-reframe-action": "错误动作 + 重新定义 + 下一步",
  "before-after-proof": "前后对比 + 证据 + 可跟做",
  "trend-why-now-so-what": "趋势发生了什么 + 为什么现在 + 普通人怎么办",
};

export const HOOK_TYPE_LABEL: Record<HookType, string> = {
  scene: "具体场景",
  contrast: "前后反差",
  result: "可见结果",
  question: "问题开场",
  "awkward-moment": "尴尬时刻",
};

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  prompt: "提示词",
  checklist: "清单",
  "table-fields": "表格字段",
  "judgment-questions": "判断三问",
  "mini-practice": "小练习",
};

const ABSTRACT_WORDS = ["能力", "方法", "方法论", "系统", "流程", "判断", "策略", "思维"];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

export function countAbstractWords(text: string): number {
  return ABSTRACT_WORDS.filter((word) => text.includes(word)).length;
}

export function titleMatchesStructure(title: string, structure?: ViralTitleStructure): boolean {
  if (!structure) return true;
  const value = title.trim();
  if (!value) return false;

  switch (structure) {
    case "pain-solved":
      return /(最烦|最痛苦|终于不用|被.*解决|卡住|熬夜|返工|尴尬)/.test(value);
    case "before-after":
      return /(用.*前|之前|以前).*(用.*后|之后|后来|结果)/.test(value);
    case "ordinary-growth":
      return /(普通人|0基础|零基础).*(先别|先练|先学|建议先)/.test(value);
    case "workflow-reveal":
      return /(工作流长这样|流程长这样|我是怎么做|我现在固定用)/.test(value);
    case "result-demo":
      return /(我用.*做出了|做成了|做完了|成品|模板|卡片|表格)/.test(value);
    case "curiosity-opportunity":
      return /(出现后|该先问|值不值得|机会|风险|普通人该先问)/.test(value);
    default:
      return true;
  }
}

export function inferHookTypeFromTitle(title: string): HookType | undefined {
  if (!title) return undefined;
  if (/[?？]|怎么|为什么|如何|该不该|有没有/.test(title)) return "question";
  if (/(结果|没想到|反而|之前|之后|前|后)/.test(title)) return "contrast";
  if (/(做出了|省了|搞定了|不用.*了|终于|模板|清单|成品)/.test(title)) return "result";
  if (/(开会|周报|面试|汇报|写方案|做表|下班前|带娃|家庭|客户|同事)/.test(title)) return "scene";
  if (/(尴尬|崩溃|返工|卡住|熬夜|救命|手忙脚乱)/.test(title)) return "awkward-moment";
  return undefined;
}

export function inferAssetType(text: string): AssetType | undefined {
  if (!text) return undefined;
  if (/prompt|提示词/i.test(text)) return "prompt";
  if (/清单|checklist/i.test(text)) return "checklist";
  if (/字段|表头|table/i.test(text)) return "table-fields";
  if (/三问|判断题|先问/i.test(text)) return "judgment-questions";
  if (/练习|一周|每天做一次|小作业/.test(text)) return "mini-practice";
  return undefined;
}

export function inferContentLane(card: Pick<ContentCard, "painPoint" | "realCase" | "coreViewpoint" | "titleCandidates">): ContentLane {
  const text = [card.titleCandidates?.[0], card.painPoint, card.realCase, card.coreViewpoint].filter(Boolean).join(" ");
  if (/(隐私|权限|泄露|账号|风险|误删|安全)/.test(text)) return "safety-pitfall";
  if (/(副业|接单|报价|生意|客户|变现|现金流)/.test(text)) return "cashflow";
  if (/(面试|学习|英语|读书|复习|简历|成长)/.test(text)) return "learning-growth";
  if (/(孩子|家庭|带娃|家人|生活|做饭|旅行)/.test(text)) return "life-family";
  if (/(趋势|新工具|新模型|新闻|机会|普通人该先问)/.test(text)) return "ai-radar";
  return "work-situation";
}

export function inferReferencePool(card: Pick<ContentCard, "contentLane" | "coreViewpoint" | "reusableAsset">): ReferencePool {
  const text = [card.coreViewpoint, card.reusableAsset].filter(Boolean).join(" ");
  if (card.contentLane === "ai-radar" || card.contentLane === "cashflow") return "trend-radar";
  if (card.contentLane === "learning-growth" || /一周|练习|入门|学习/.test(text)) return "learning-path";
  if (/工作流|自动化|知识库|流程|判断|验收/.test(text)) return "workflow-system";
  return "tool-hands-on";
}

export function inferTitleStructure(card: Pick<ContentCard, "titleCandidates" | "contentLane" | "coreViewpoint">): ViralTitleStructure {
  const title = card.titleCandidates?.[0] || "";
  if (titleMatchesStructure(title, "before-after")) return "before-after";
  if (titleMatchesStructure(title, "ordinary-growth")) return "ordinary-growth";
  if (titleMatchesStructure(title, "workflow-reveal")) return "workflow-reveal";
  if (titleMatchesStructure(title, "result-demo")) return "result-demo";
  if (titleMatchesStructure(title, "curiosity-opportunity")) return "curiosity-opportunity";
  if (card.contentLane === "ai-radar" || card.contentLane === "cashflow") return "curiosity-opportunity";
  return "pain-solved";
}

export function inferBodyStructure(card: Pick<ContentCard, "contentLane" | "outline" | "coreViewpoint">): ViralBodyStructure {
  const text = [...(card.outline || []), card.coreViewpoint].filter(Boolean).join(" ");
  if (card.contentLane === "ai-radar" || card.contentLane === "cashflow") return "trend-why-now-so-what";
  if (/(错误|误区|别再|没用|重新定义)/.test(text)) return "mistake-reframe-action";
  if (/(前后|之前|之后|变化|证据|对比)/.test(text)) return "before-after-proof";
  return "story-method-asset";
}

export function deriveStrategyForCard(card: ContentCard): ContentCard {
  const title = card.titleCandidates[0] || card.coreViewpoint;
  const contentLane = card.contentLane || inferContentLane(card);
  const viralTitleStructure = card.viralTitleStructure || inferTitleStructure({ ...card, contentLane });
  const viralBodyStructure = card.viralBodyStructure || inferBodyStructure({ ...card, contentLane });
  const assetType = card.assetType || inferAssetType(card.reusableAsset) || "checklist";
  const hookType = card.hookType || inferHookTypeFromTitle(title) || "scene";
  const referencePool = card.referencePool || inferReferencePool({ ...card, contentLane });

  return {
    ...card,
    contentLane,
    referencePool,
    viralTitleStructure,
    viralBodyStructure,
    hookType,
    assetType,
  };
}

export function firstThreeLines(content: string): string {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
}

export function hasCollectibleAsset(draft: DraftNote, topic: ContentCard | null): boolean {
  const text = [draft.content, draft.commentPrompt, draft.collectibleAssetPreview, topic?.reusableAsset].filter(Boolean).join("\n");
  return /(prompt|提示词|清单|字段|表格|三问|判断|练习|模板)/i.test(text);
}

export function bodyMatchesStructure(draft: DraftNote, topic: ContentCard | null): boolean {
  const structure = draft.viralBodyStructure || topic?.viralBodyStructure;
  const text = draft.content;
  if (!structure) return true;

  switch (structure) {
    case "story-method-asset":
      return /(我.*卡住|这次|后来发现|我现在|固定用|提示词|清单|判断)/.test(text);
    case "mistake-reframe-action":
      return /(错误|误区|问题不是|而是|下一步|先做|别再)/.test(text);
    case "before-after-proof":
      return /(之前|以前|后来|结果|改了一个动作|现在|复刻)/.test(text);
    case "trend-why-now-so-what":
      return /(最近|现在|值得看|机会|风险|普通人|先问)/.test(text);
    default:
      return true;
  }
}

export function getSimilarityNeedle(topic: Pick<ContentCard, "titleCandidates" | "coreViewpoint"> | Pick<DraftNote, "title">): string {
  if ("title" in topic) return normalizeText(topic.title);
  return normalizeText(topic.titleCandidates[0] || topic.coreViewpoint);
}
