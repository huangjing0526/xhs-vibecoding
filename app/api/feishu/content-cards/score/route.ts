import { NextRequest } from "next/server";
import { apiError, apiOk, readJsonBody } from "../../_utils";
import { searchFeishuRecords, updateFeishuRecord } from "@/lib/feishu";
import { generateWorkflowJson } from "@/lib/workflowAi";
import {
  ContentCard,
  filterByStatus,
  filterUsableContentCards,
  normalizeContentCard,
} from "@/lib/xhsWorkflow";
import { buildDaokuScorePrompt, DaokuScore, DAOKU_SCORE_FALLBACK } from "@/lib/daoku";

interface ScoreRequest {
  /** 直接传选题卡片；不传则按 status 从飞书选题表取 */
  cards?: ContentCard[];
  /** 取选题表里哪些状态的（默认全取可用的） */
  status?: string;
  /** 是否把质量分/命中道/偏爆偏哑写回飞书选题表（默认写） */
  writeBack?: boolean;
}

/** 选题卡片 → 道库打分用的待判选题 */
function cardToTopic(card: ContentCard): { title: string; painPoint?: string; asset?: string; source?: string } {
  return {
    title: card.titleCandidates[0] || card.coreViewpoint || card.topicId,
    painPoint: card.painPoint || undefined,
    asset: card.reusableAsset || undefined,
    source: card.sourceMaterial || undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<ScoreRequest>(request, "contentCards.score.readJson");
    const writeBack = body.writeBack !== false;

    const cards: ContentCard[] =
      body.cards && body.cards.length
        ? body.cards
        : filterUsableContentCards(
            filterByStatus(
              (await searchFeishuRecords("topic")).map(normalizeContentCard),
              body.status
            )
          );

    if (cards.length === 0) {
      return apiOk({ scores: [], writeBack }, "没有可评分的选题");
    }

    const scores: Array<{ recordId: string; topicId: string; title: string; score: DaokuScore }> = [];
    let usedFallback = false;
    const writeResults: unknown[] = [];

    for (const card of cards) {
      const topic = cardToTopic(card);
      const aiResult = await generateWorkflowJson<DaokuScore>({
        action: "contentCards.daokuScore",
        prompt: buildDaokuScorePrompt(topic),
        fallback: DAOKU_SCORE_FALLBACK,
        maxTokens: 900,
        // 道库判断走默认 provider（按 env 探测，当前为 Gemini）
      });
      if (aiResult.usedFallback) usedFallback = true;
      const score = aiResult.result;
      scores.push({ recordId: card.recordId || "", topicId: card.topicId, title: topic.title, score });

      if (writeBack && card.recordId && !aiResult.usedFallback) {
        writeResults.push(
          await updateFeishuRecord("topic", card.recordId, {
            "质量分": `${score.score}/10`,
            "命中道": score.hitDao || "（未命中道）",
            "偏爆偏哑": score.verdict,
          })
        );
      }
    }

    return apiOk(
      { scores, writeBack, writeResults, usedFallback },
      usedFallback
        ? "未检测到 AI 配置，道库评分未跑（检查 GEMINI_API_KEY 等）"
        : "道库评分完成"
    );
  } catch (error) {
    return apiError(error, "contentCards.daokuScore", "道库评分失败");
  }
}
