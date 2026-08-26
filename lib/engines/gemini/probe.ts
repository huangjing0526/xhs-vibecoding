/**
 * Gemini 引擎探测。
 *
 * 图片工厂和视频工厂问的是同一串问题——key 在不在、拉不拉得到模型、今天的额度还剩没剩——
 * 只有「取图像模型还是视频模型」和最后那句文案不同。各写一遍的结果是判断会漂：
 * 「额度用完仍算已认证」这条规则曾经在两处各有一个副本。
 *
 * 这里只回事实，不回文案。怎么措辞归各自的路由，因为那是给不同界面看的。
 */

import { readGeminiKey } from "./index";
import { listGeminiModels, type GeminiModel } from "./models";
import { readQuotaState } from "./quota";

export interface GeminiProbe {
  /** 没配 key 时其余字段都不用看 */
  hasKey: boolean;
  models: GeminiModel[];
  defaultModel?: string;
  /** 今天撞过配额的话，这里是那句人话；没撞过就是空 */
  quotaMessage?: string;
  /** 探测本身失败（网络、key 无效）时的原因 */
  error?: string;
}

export async function probeGeminiEngine(kind: "image" | "video"): Promise<GeminiProbe> {
  if (!readGeminiKey()) return { hasKey: false, models: [] };

  try {
    const [catalog, quota] = await Promise.all([listGeminiModels(), readQuotaState()]);
    const models = catalog[kind];
    return {
      hasKey: true,
      models,
      defaultModel: models[0]?.id,
      quotaMessage: quota?.message,
    };
  } catch (error) {
    console.error("[Gemini] 引擎探测失败", {
      userId: "local",
      action: `gemini.probe.${kind}`,
      error,
    });
    return {
      hasKey: true,
      models: [],
      error: error instanceof Error ? error.message : "探测失败",
    };
  }
}
