/**
 * 脚本改写：拿对标拆出的「结构骨架」+ 我自己的选题，写一版全新的口播稿。
 *
 * 合规边界写死在 prompt 里：只借结构、节奏、分镜逻辑，一句原文都不许抄。
 * 这条线对应 workspace 里那条 AI 生成式视频 SOP 的「剧本」环节。
 */

import type { BenchmarkSkeleton, ScriptDraft, ScriptSegment, TopicInput } from "./types";
import type { ScriptAnalysis } from "../videoExtract";

/** 中文口播约每秒 4.5 字，用来把字数折成时长；宁可估短，长了分镜会切不下。 */
const CHARS_PER_SECOND = 4.5;

/** 差这么多秒，大概要增删多少字——提示里给字数才是能直接动手的量。 */
export function secondsToChars(seconds: number): number {
  return Math.round(Math.abs(seconds) * CHARS_PER_SECOND);
}

export interface ScriptDurationCheck {
  /** 正=比目标长，负=比目标短 */
  deltaSec: number;
  status: "ok" | "over" | "under";
}

/**
 * 脚本估算时长与目标的偏差。
 * 容差取目标的 15% 且不低于 5 秒：按比例卡短片太严，按固定值卡长片又太松。
 */
export function checkScriptDuration(estimatedSec: number, targetSec: number): ScriptDurationCheck {
  const tolerance = Math.max(5, Math.round(targetSec * 0.15));
  const deltaSec = estimatedSec - targetSec;
  if (deltaSec > tolerance) return { deltaSec, status: "over" };
  if (deltaSec < -tolerance) return { deltaSec, status: "under" };
  return { deltaSec, status: "ok" };
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** 把拆片结果收敛成结构骨架：只留结构，丢掉原文片段。 */
export function analysisToSkeleton(
  analysis: ScriptAnalysis,
  meta: { platform: string; author: string; title: string; videoUrl: string }
): BenchmarkSkeleton {
  return {
    platform: meta.platform,
    author: meta.author,
    title: meta.title,
    videoUrl: meta.videoUrl,
    hook: analysis.hook,
    // 只带 stage/purpose，不带 text——原句留在拆片页，不进下游
    stages: analysis.structure.map((item) => ({ stage: item.stage, purpose: item.purpose })),
    style: analysis.style,
    painPoint: analysis.painPoint,
    reusableTemplate: analysis.reusableTemplate,
  };
}

/** 估算一稿脚本的时长，UI 与分镜切段都用它。 */
export function estimateDurationSec(draft: Pick<ScriptDraft, "hook" | "segments" | "cta">): number {
  const chars = [draft.hook, ...draft.segments.map((s) => s.voiceover), draft.cta]
    .map((text) => Array.from(str(text)).length)
    .reduce((sum, n) => sum + n, 0);
  return Math.max(1, Math.round(chars / CHARS_PER_SECOND));
}

function skeletonSection(skeleton: BenchmarkSkeleton | null): string {
  if (!skeleton) return "（没有对标来源，直接按选题从零写）";
  const stages = skeleton.stages
    .map((item, index) => `${index + 1}. ${item.stage || `第 ${index + 1} 段`}：${item.purpose || "（未标注作用）"}`)
    .join("\n");
  return `来源：${skeleton.platform} @${skeleton.author || "未知作者"}
钩子的设计思路：${skeleton.hook || "（未拆出）"}
分段结构：
${stages || "（未拆出）"}
语言与节奏特征：${skeleton.style || "（未拆出）"}
戳中的痛点：${skeleton.painPoint || "（未拆出）"}
可复用模板：${skeleton.reusableTemplate || "（未拆出）"}`;
}

export function buildScriptRewritePrompt(options: {
  skeleton: BenchmarkSkeleton | null;
  topic: TopicInput;
  targetDurationSec: number;
}): string {
  const { skeleton, topic, targetDurationSec } = options;
  return `你在帮一个做短视频的团队写口播脚本。

【对标视频的结构骨架】
${skeletonSection(skeleton)}

【这次要讲的是我自己的东西】
主题：${topic.topic || "（未填）"}
产品/服务：${topic.product || "无"}
卖点 / 核心观点：
${topic.sellingPoints || "（未填）"}
目标观众：${topic.audience || "（未填）"}

【硬性边界，违反即作废】
- 只借对标的结构、节奏和分段逻辑，一句原文都不许出现，也不要改头换面地转述原句。
- 所有案例、数据、场景必须来自上面「我自己的东西」，缺什么就不写，绝不编造数字或案例。
- 不要出现平台引流词、夸大承诺、绝对化用语。

【写作要求】
- 目标时长约 ${targetDurationSec} 秒，中文口播按每秒 4.5 字估算，别写超。
- 开头 3 秒必须立住钩子，让人不划走。
- 段落数与对标结构对齐；对标没拆出结构时，自己按 钩子 / 痛点 / 干货 / 转折 / 行动号召 组织。
- 口播稿写成人说的话：短句、口语、有停顿感，不要书面语和排比腔。

只返回 JSON，不要解释。格式：
{
  "title": "这条视频的标题",
  "hook": "开头 3 秒的口播原文",
  "segments": [
    { "stage": "阶段名", "purpose": "这一段要达成什么", "voiceover": "这一段的口播原文" }
  ],
  "cta": "结尾的行动号召口播原文",
  "borrowedStructure": "一句话说清：借了对标的什么结构，换掉了哪些具体内容"
}`;
}

/** 未配置 AI 时的兜底：把选题原样铺成一稿骨架，让人接着手写。 */
export function createFallbackScriptDraft(
  skeleton: BenchmarkSkeleton | null,
  topic: TopicInput
): ScriptDraft {
  const stages = skeleton?.stages.length
    ? skeleton.stages
    : [
        { stage: "钩子", purpose: "3 秒内抓住人" },
        { stage: "干货", purpose: "把卖点讲清楚" },
        { stage: "行动号召", purpose: "引导下一步" },
      ];
  const segments: ScriptSegment[] = stages.map((item) => ({
    stage: item.stage || "未命名段",
    purpose: item.purpose || "",
    voiceover: "",
  }));
  const draft = {
    title: topic.topic || "未命名脚本",
    hook: "",
    segments,
    cta: "",
    borrowedStructure: skeleton
      ? `未配置 AI，已按 @${skeleton.author || "对标"} 的分段结构留好空位，口播稿请手写。`
      : "未配置 AI，已铺好通用结构，口播稿请手写。",
  };
  return { ...draft, estimatedDurationSec: estimateDurationSec(draft) };
}

/** 收敛模型返回，缺字段不抛错——宁可少一段，不要整页崩掉。 */
export function normalizeScriptDraft(raw: ScriptDraft | undefined, fallback: ScriptDraft): ScriptDraft {
  if (!raw) return fallback;
  const segments = Array.isArray(raw.segments) ? raw.segments : [];
  const normalized = {
    title: str(raw.title) || fallback.title,
    hook: str(raw.hook),
    segments: segments
      .filter((item) => item && (str(item.stage) || str(item.voiceover)))
      .map((item) => ({
        stage: str(item.stage),
        purpose: str(item.purpose),
        voiceover: str(item.voiceover),
      })),
    cta: str(raw.cta),
    borrowedStructure: str(raw.borrowedStructure),
  };
  if (!normalized.segments.length) return fallback;
  return { ...normalized, estimatedDurationSec: estimateDurationSec(normalized) };
}
