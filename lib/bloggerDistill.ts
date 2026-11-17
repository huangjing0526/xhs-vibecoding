/**
 * 对标博主道库蒸馏：从该博主的高分笔记里提炼「可迁移的判断路径」。
 *
 * 与 `lib/viralSignals.ts` 同一条纪律：**没有 AI 时不编内容**。
 * `createFallbackBloggerDistillation`（lib/bloggerWorkflow.ts）产出的是一段写死的模板文本，
 * 它作为「AI 不可用时界面不至于空着」的占位是可以的，但**不能落库、不能当成对该博主的分析**——
 * 一旦写进飞书就会被 rewrite/inline 当作口径约束喂进 prompt，用户还分辨不出它是模板还是真分析。
 */

import type { BloggerNote, BloggerProfile, BloggerSample } from "./bloggerWorkflow";

const MAX_SAMPLES = 12;
const MAX_SAMPLE_CHARS = 400;

function clip(text: string, max: number): string {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return Array.from(normalized).slice(0, max).join("");
}

function isNote(sample: BloggerSample): sample is BloggerNote {
  return "analysis" in sample;
}

/** 优先喂高分笔记：蒸馏要学的是「为什么这几条爆了」，不是账号的平均水平。 */
function pickSamples(samples: BloggerSample[]): BloggerSample[] {
  const rank = (sample: BloggerSample) => (isNote(sample) ? sample.analysis?.viralityScore ?? -1 : -1);
  return [...samples].sort((left, right) => rank(right) - rank(left)).slice(0, MAX_SAMPLES);
}

function describeSample(sample: BloggerSample, index: number): string {
  const analysis = isNote(sample) ? sample.analysis : undefined;
  const head = [
    `${index + 1}. 标题：${sample.title || "（无）"}`,
    analysis?.viralityScore !== undefined ? `爆款潜力 ${analysis.viralityScore}` : "",
    analysis?.hitSignals.length ? `命中信号：${analysis.hitSignals.join("、")}` : "",
    analysis?.hookSentence ? `钩子：${analysis.hookSentence}` : "",
  ]
    .filter(Boolean)
    .join("｜");
  return `${head}\n   正文：${clip(sample.content, MAX_SAMPLE_CHARS) || "（无）"}`;
}

export function buildDistillationPrompt(profile: BloggerProfile, samples: BloggerSample[]): string {
  const picked = pickSamples(samples);
  return `你在帮一个做内容的团队拆解对标博主，产出一份**可迁移的判断路径**（内部叫「道库」）。

对标博主：${profile.name}｜平台：${profile.platform}
${profile.bio ? `简介：${profile.bio}` : ""}
${profile.followers !== undefined ? `粉丝数：${profile.followers}` : ""}

以下是该博主的代表作（已按爆款潜力从高到低排列）：
${picked.map(describeSample).join("\n")}

请提炼出这个博主真正在用的判断路径。核心要求：

- **借道不借皮**：要提炼「他为什么这样选题/这样起标题」的判断依据，不是抄他的句式和人设。
- 只写样本里**确实体现出来的**规律，宁少勿凑。样本支撑不了的维度就给空数组。
- 「边界」写迁移到别的账号时**不能照搬**的东西（他的专属人设、行业黑话、具体数据）。
- 「迁移备注」写迁移到别的账号时**要替换成什么**。

只返回 JSON，不要解释。格式：
{
  "coreDao": "一句话说清这个博主的核心判断路径",
  "topicDao": ["选题上的判断依据"],
  "titlePatterns": ["标题的结构规律，用占位符表达如「别急着 X，先看你是不是 Y」"],
  "contentPatterns": ["正文的组织方式"],
  "visualPatterns": ["封面/配图的规律，样本里看不出就给空数组"],
  "toneRules": ["语气上的约束"],
  "boundaries": ["迁移时不能照搬的东西"],
  "adaptationNotes": ["迁移到自己账号时要替换成什么"]
}`;
}

/** AI 不可用时的诚实兜底：**不编内容**，留空并说明，由人手工填写。 */
export function createEmptyDistillation(profile: BloggerProfile): {
  coreDao: string;
  topicDao: string[];
  titlePatterns: string[];
  contentPatterns: string[];
  visualPatterns: string[];
  toneRules: string[];
  boundaries: string[];
  adaptationNotes: string[];
} {
  return {
    coreDao: "未配置 AI，无法自动蒸馏。请在飞书「对标账号」表里手工填写这个博主的判断路径。",
    topicDao: [],
    titlePatterns: [],
    contentPatterns: [],
    visualPatterns: [],
    toneRules: [],
    boundaries: [],
    adaptationNotes: [],
  };
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(str).filter(Boolean);
}

/** 归一模型输出：`generateWorkflowJson<T>` 是类型断言而非校验，这里把非法形状清掉。 */
export function normalizeDistillationFields(raw: Record<string, unknown> | undefined) {
  if (!raw) return null;
  return {
    coreDao: str(raw.coreDao),
    topicDao: strList(raw.topicDao),
    titlePatterns: strList(raw.titlePatterns),
    contentPatterns: strList(raw.contentPatterns),
    visualPatterns: strList(raw.visualPatterns),
    toneRules: strList(raw.toneRules),
    boundaries: strList(raw.boundaries),
    adaptationNotes: strList(raw.adaptationNotes),
  };
}
