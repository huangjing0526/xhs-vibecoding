/**
 * 道库质量引擎（从复利工程 distill-blogger skill 蒸馏内嵌）
 *
 * 用途：用三位在库博主的「道」+ 三关 + 判别力测，判一条小红书选题是否爆款形态。
 * 部署在 Cloudflare 上读不到本地 distill-blogger，所以把可执行准则一次性固化在这里。
 * 来源：/Users/kp/复利工程/.claude/skills/distill-blogger/SKILL.md（更新博主道时同步这里）。
 */

/** 在库三位博主的「道」（投影到「用 AI 的元技能·成长号」领域） */
export const DAOKU_BLOGGERS = `
【小A学财经 · 道=「照见自己」】
好内容让读者照见自己用 AI 的处境/欲望（"我也踩过""我也想这样"），不是单纯教知识。
判别式：落不到读者自己身上、只增加知识 → 哑；让读者"看到自己的影子" → 爆。

【数字生命卡兹克 · 道=「主流硬工具 + 保姆级 + 强情绪即时」】
选题要落在读者真会用的主流 AI 工具（ChatGPT/Claude/Agent…）上、给保姆级可照做的动作/清单（走收藏）；大事件/真福利走分享。
判别式（锋利）：主流工具+保姆级+强情绪 → 爆；冷门工具/纯炫技/自家事/读者不会用的 → 必哑。

【孙耀说家具 · 道=「具体 + 反差 + 够得着的奇观」】
要有具体场景 + 一个反差/反直觉钩子（"你以为 AI 做不到/很难，其实够得着，而且你也能"）。
判别式：具体+反差+够得着 → 爆；泛泛而谈/够不着/无反差/纯炫技 → 哑。
`.trim();

/** 三关（账号定位兜底） */
export const DAOKU_SANGUAN = `
① 小白够得着：读者是想用 AI 提效的普通人/独立开发者/自由职业者，不是工程师圈子。架构级、纯技术实现的题 → 砍。
② 向往非恐惧：钩子是"原来 AI 能这样帮我"，不是"不这样会出事"的焦虑贩卖。
③ 能抽成通用技能：必须从具体场景抽象成"任何人都能照搬的一招"。抽不出 → 砍。
`.trim();

/** 判别力测（distill-blogger 验证层主闸） */
export const DAOKU_PANBIELI = `
把这条选题的"技能/教训"拿去问：它能区分"该学的人 / 用不上的人"吗？
对谁都成立、放哪都对（"AI 很强大""要会用工具"）= 解释一切 = 伪道废话 → 砍。
只有"对特定处境有区分力"的才留。
`.trim();

/** 语气分档（2026-06-05 PM 规则） */
export const DAOKU_TONE = `
- 偏 AI 应用类（普通人怎么用 AI 提效）→ 大白话、零技术术语、小白够得着。
- 偏开发经验分享类（面向懂技术的人讲技术方法）→ 可用专业语言、讲深、适度保留术语。
- 偏行业洞察类（AI Radar 趋势/风向）→ 大白话但角度是"看懂 AI 风向 + 你的机会"，命中卡兹克道2+小A道，不拍成实操 tips。
拿不准默认大白话。
`.trim();

/** 选题打分结果（写回飞书选题表的 质量分/命中道/偏爆偏哑 三字段） */
export interface DaokuScore {
  /** 命中的道（如 "卡兹克保姆级 + 小A照见 + 孙耀反差"），命中不了任何道则空 */
  hitDao: string;
  /** 三关逐关 */
  sanguan: { reachable: boolean; aspirational: boolean; transferable: boolean };
  /** 判别力测：是否有区分力（true=有，false=解释一切的伪道） */
  discriminating: boolean;
  /** 综合判定 */
  verdict: "偏爆" | "中性" | "偏哑";
  /** 0-10 爆款潜力分 */
  score: number;
  /** 建议语气档：AI应用 / 开发经验 / 行业洞察 */
  tone: "AI应用" | "开发经验" | "行业洞察";
  /** 判定理由（2-4 条） */
  reasons: string[];
  /** 让它更爆的改进（0-3 条） */
  fixes: string[];
}

/** Claude 道库打分的 fallback（mock / 失败时） */
export const DAOKU_SCORE_FALLBACK: DaokuScore = {
  hitDao: "",
  sanguan: { reachable: false, aspirational: false, transferable: false },
  discriminating: false,
  verdict: "中性",
  score: 0,
  tone: "AI应用",
  reasons: ["（未配 Claude 或判定失败，未跑道库）"],
  fixes: [],
};

/** 构造道库打分 prompt（给 Claude） */
export function buildDaokuScorePrompt(topic: {
  title: string;
  painPoint?: string;
  asset?: string;
  source?: string;
}): string {
  return `你是小红书爆款选题评审员，用 distill-blogger 道库判断下面这条选题是否爆款形态。借道不借皮：用博主的判断路径，落到「用 AI 的元技能·成长号」领域。

## 在库博主的道
${DAOKU_BLOGGERS}

## 三关
${DAOKU_SANGUAN}

## 判别力测
${DAOKU_PANBIELI}

## 语气分档
${DAOKU_TONE}

## 待判选题
- 标题/选题：${topic.title}
${topic.painPoint ? `- 读者痛点：${topic.painPoint}` : ""}
${topic.asset ? `- 可收藏资产：${topic.asset}` : ""}
${topic.source ? `- 来源素材：${topic.source}` : ""}

## 输出（严格 JSON，不要多余文字）
{
  "hitDao": "命中哪位博主的哪条道，如 '卡兹克保姆级+小A照见+孙耀反差'；命中不了任何道则空字符串",
  "sanguan": { "reachable": 小白够得着 true/false, "aspirational": 向往非恐惧 true/false, "transferable": 能抽成通用技能 true/false },
  "discriminating": 判别力测有区分力 true/false,
  "verdict": "偏爆" | "中性" | "偏哑",
  "score": 0-10 的数字,
  "tone": "AI应用" | "开发经验" | "行业洞察",
  "reasons": ["基于道库判别式的理由，2-4 条"],
  "fixes": ["让它更爆的具体改进，0-3 条"]
}

判定规则：命中不了任何道 → 偏哑、score≤4；三关有一关挂 → 至多中性；判别力测不过（解释一切）→ 砍到偏哑。全程中文。`;
}
