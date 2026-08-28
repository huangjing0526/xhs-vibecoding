import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import {
  buildBloggerDistillPrompt,
  createFallbackBloggerDistillation,
  mergeDistilledDao,
  type BloggerProfile,
  type BloggerSample,
  type DistilledDao,
} from "@/lib/bloggerWorkflow";
import { generateWorkflowJson } from "@/lib/workflowAi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DistillBody {
  profile?: BloggerProfile;
  samples?: BloggerSample[];
}

/**
 * 蒸馏一位博主的道。
 * 模型只出「道」和额外槽位，id / 名字 / 时间 / 基座三槽由这里补——那几样编不得。
 * 没配 AI 或模型返回不可用时，落到关键词启发式的那份骨架，不空手回去。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<DistillBody>(request, "daoku.distill.readJson");
    const profile = body.profile;
    if (!profile?.id || !profile.name) return apiBadRequest("缺少博主信息，先在对标博主里选一位");

    const samples = body.samples || [];
    const base = createFallbackBloggerDistillation(profile, samples);
    const { result, usedFallback, provider } = await generateWorkflowJson<Partial<DistilledDao>>({
      action: "daoku.distill",
      prompt: buildBloggerDistillPrompt(profile, samples),
      // 骨架已经在 base 里，这里给空对象就够：合并时空字段一律留骨架的
      fallback: {},
      maxTokens: 2500,
    });

    const distillation = mergeDistilledDao(base, result);
    console.info("[Daoku] 蒸馏完成", {
      action: "daoku.distill",
      bloggerId: profile.id,
      sampleCount: samples.length,
      usedFallback,
      provider,
    });

    return apiOk(
      { distillation, usedFallback, provider },
      usedFallback ? "未检测到 AI 配置，已按关键词规则出了一版骨架" : `已蒸馏「${profile.name}」的道`,
    );
  } catch (error) {
    return apiError(error, "daoku.distill", "蒸馏失败");
  }
}
