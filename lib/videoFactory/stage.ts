/**
 * 叙事阶段：把镜头归到「钩子 / 背书 / 干货 / 体验 / 行动号召」这一层。
 *
 * 为什么需要这一层——拆出来的是剪辑单位，不是创作单位。
 * 一条 80 秒的片子切出 34 个镜头，逐镜看、逐镜绑、逐镜生成，人扛不住，
 * 而 MCN 拆片实际拆的从来就是这四样：开场钩子、切镜节奏、情绪曲线、转化引导位置——
 * 全在阶段层，没有一样是「第 13 镜画面里有什么」。
 *
 * 两个显而易见的分组依据实测都不行：按口播句子分，34 镜只并成 31 组
 * （whisper 的分段粒度本来就约等于镜头粒度）；按画面场景分，只有抽样到的
 * 12 镜有描述，其余全算「延续」，分出来的组是假的。所以只能按叙事分。
 */

import type { BenchmarkRhythm } from "./benchmark";

export interface BenchmarkStage {
  /** 阶段名，如「钩子与超级福利」 */
  name: string;
  /** 这一段要达成什么 */
  purpose: string;
  /** 属于这一段的镜号，连续区间 */
  shots: number[];
}

/** 模型只回起始镜号，区间由服务端算——见 normalizeStages 的注释。 */
interface RawStage {
  name?: unknown;
  purpose?: unknown;
  fromShot?: unknown;
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * 归组用的提示词。
 *
 * 只喂口播和时长，不喂画面——这一步判的是「这段在说什么事」，纯文本就够，
 * 而看图那次调用贵一个量级，没必要为分组再看一遍。
 */
export function buildStagePrompt(rhythm: BenchmarkRhythm, known?: Array<{ stage: string; purpose: string }>): string {
  const lines = rhythm.shots
    .map((shot) => {
      const said = shot.voiceover?.text ? `「${shot.voiceover.text}」` : "（无人声）";
      return `第 ${shot.order} 镜 ${shot.durationSec}秒 ${said}`;
    })
    .join("\n");

  const knownSection = known?.length
    ? `\n【这条片子的叙事结构已经拆过了，就按这几段，不要另起炉灶】
${known.map((item, index) => `${index + 1}. ${item.stage}：${item.purpose}`).join("\n")}\n`
    : `\n【自己判断分几段】
带货口播一般是 4 到 6 段，典型走法是「钩子 → 背书 → 干货/展示 → 体验 → 行动号召」。
段数宁少勿多：分到七八段就失去归组的意义了。\n`;

  return `下面是一条对标视频逐镜的时长和口播。把这些镜头按叙事分成几段。
${knownSection}
${lines}

【怎么分】
- 叙事是线性的，每一段都是连续的一批镜头，钩子不会跑到中间去。
- 所以你只要给每一段**从第几镜开始**，后面的镜头自动归它，直到下一段开始。
- 第一段必须从第 1 镜开始。
- 按镜号从小到大给。
- 判断依据是口播在说什么事，不是画面。没人声的镜头跟着它前后的语义走。

只返回 JSON，不要解释：
{
  "stages": [
    { "name": "钩子与超级福利", "purpose": "这一段要达成什么，一句话", "fromShot": 1 },
    { "name": "背书与门店信息", "purpose": "...", "fromShot": 5 }
  ]
}`;
}

/**
 * 收敛模型返回。
 *
 * 模型只给起始镜号，区间在这里算：按起点排序，每段一直覆盖到下一段的起点之前，
 * 最后一段收到片尾。这样连续、不重叠、不遗漏是**结构上保证**的，
 * 不需要再去校验模型有没有把第 7 镜同时分给两段、或者漏掉第 13 镜。
 */
export function normalizeStages(
  raw: { stages?: unknown } | undefined,
  rhythm: BenchmarkRhythm,
): BenchmarkStage[] {
  const orders = rhythm.shots.map((shot) => shot.order).sort((a, b) => a - b);
  if (!orders.length) return [];

  const items = (Array.isArray(raw?.stages) ? raw.stages : []) as RawStage[];
  const parsed = items
    .map((item) => ({ name: str(item.name), purpose: str(item.purpose), fromShot: Number(item.fromShot) }))
    .filter((item) => item.name && Number.isInteger(item.fromShot))
    .sort((a, b) => a.fromShot - b.fromShot);
  if (!parsed.length) return [];

  // 第一段无论模型说从第几镜开始，都从头接起——否则开头几镜会无家可归
  parsed[0].fromShot = orders[0];

  const stages: BenchmarkStage[] = [];
  for (const [index, item] of parsed.entries()) {
    const next = parsed[index + 1]?.fromShot ?? Infinity;
    const shots = orders.filter((order) => order >= item.fromShot && order < next);
    // 起点重复或超出范围会切出空段，丢掉——空段在界面上是个点不开的壳
    if (shots.length) stages.push({ name: item.name, purpose: item.purpose, shots });
  }
  return stages;
}

/** 这一镜属于哪一段。界面按镜取段用。 */
export function stageOfShot(stages: BenchmarkStage[] | undefined, order: number): BenchmarkStage | null {
  return (stages || []).find((stage) => stage.shots.includes(order)) || null;
}

/** 一段占多长。生成时要按引擎档位拆段，看的就是它。 */
export function stageDurationSec(stage: BenchmarkStage, rhythm: BenchmarkRhythm): number {
  const inStage = new Set(stage.shots);
  const total = rhythm.shots
    .filter((shot) => inStage.has(shot.order))
    .reduce((sum, shot) => sum + shot.durationSec, 0);
  return Math.round(total * 100) / 100;
}
