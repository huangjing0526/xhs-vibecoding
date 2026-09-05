/**
 * 把镜头归到叙事阶段。
 *
 * 单独一次纯文本调用，不和看片合并：看片是多模态，贵一个量级，
 * 而归组只需要口播和时长。合在一起等于为了分组把那叠图再付一遍钱。
 *
 * 失败一律吞掉——和结构量化、节拍对齐一个规矩：节奏是硬数据，
 * 不该被一个锦上添花的分层拖垮。
 */

import { generateWorkflowJson } from "@/lib/workflowAi";
import {
  buildStagePrompt,
  normalizeStages,
  type BenchmarkRhythm,
  type BenchmarkStage,
} from "@/lib/videoFactory";

/**
 * 归一次组。返回空数组表示没归成，调用方按「没有这一层」处理。
 *
 * known 是已经拆过的叙事结构（贴链接那条线的 skeleton.stages）。
 * 有就照着它分，别另起炉灶——同一条片子在两个地方给出两套阶段名，
 * 人对不上，下游也没法拿哪一套当准。
 */
export async function groupIntoStages(
  rhythm: BenchmarkRhythm,
  known?: Array<{ stage: string; purpose: string }>,
): Promise<BenchmarkStage[]> {
  // 一句口播都没有就别问了：这一步判的是「在说什么事」，没词可判
  if (!rhythm.shots.some((shot) => shot.voiceover?.text)) {
    console.info("[VideoFactory] 没有口播，跳过阶段归组", {
      action: "videoFactory.benchmark.stages",
      id: rhythm.id,
    });
    return [];
  }

  try {
    const ai = await generateWorkflowJson<Parameters<typeof normalizeStages>[0]>({
      action: "videoFactory.benchmark.stages",
      prompt: buildStagePrompt(rhythm, known),
      fallback: undefined,
      // 只回几段的名字和起始镜号，用不了多少
      maxTokens: 1500,
    });
    if (ai.usedFallback) return [];
    const stages = normalizeStages(ai.result, rhythm);
    console.info("[VideoFactory] 阶段归组完成", {
      action: "videoFactory.benchmark.stages",
      id: rhythm.id,
      stages: stages.length,
      shots: rhythm.shots.length,
    });
    return stages;
  } catch (error) {
    console.warn("[VideoFactory] 阶段归组失败，只留逐镜", {
      action: "videoFactory.benchmark.stages",
      id: rhythm.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
