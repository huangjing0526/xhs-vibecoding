import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../_utils";
import { searchFeishuRecords, updateFeishuRecord } from "@/lib/feishu";
import { generateWorkflowJson } from "@/lib/workflowAi";
import {
  buildReviewPrompt,
  createFallbackReview,
  filterUsableDrafts,
  filterUsableReviewMetrics,
  isPublishedDraft,
  normalizeDraftNote,
  normalizeReviewMetric,
  ReviewMetric,
  ReviewResult,
} from "@/lib/xhsWorkflow";

interface ReviewRequest {
  writeBack?: boolean;
  metrics?: ReviewMetric[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<ReviewRequest>(request, "review.readJson");
    const writeBack = body.writeBack === true;
    const records = body.metrics ? [] : await searchFeishuRecords("review");
    const publishedNoteIds = body.metrics
      ? null
      : new Set(
          filterUsableDrafts((await searchFeishuRecords("draft")).map(normalizeDraftNote))
            .filter(isPublishedDraft)
            .map((draft) => draft.noteId)
        );
    const metrics = filterUsableReviewMetrics(body.metrics || records.map(normalizeReviewMetric)).filter((metric) => {
      return publishedNoteIds ? publishedNoteIds.has(metric.noteId) : true;
    });

    if (metrics.length === 0) {
      return apiBadRequest("没有已发布笔记的复盘数据，请先发布草稿并回填数据");
    }

    const fallbackReview = createFallbackReview(metrics);
    const aiResult = await generateWorkflowJson<ReviewResult>({
      action: "review.generate",
      prompt: buildReviewPrompt(metrics),
      fallback: fallbackReview,
      maxTokens: 3500,
    });

    const result = {
      ...fallbackReview,
      ...aiResult.result,
      recordActions: aiResult.result.recordActions || fallbackReview.recordActions,
    };

    const writeResults: unknown[] = [];
    if (writeBack && records.length > 0) {
      for (const action of result.recordActions) {
        const record = records.find((item) => normalizeReviewMetric(item).noteId === action.noteId);
        if (!record) continue;
        writeResults.push(
          await updateFeishuRecord("review", record.record_id, {
            "72小时结论": result.summary,
            "问题归因": action.diagnosis,
            "下一步动作": action.action,
            "复盘备注": action.reason,
          })
        );
      }
    }

    return apiOk(
      {
        review: result,
        writeBack,
        writeResults,
        usedFallback: aiResult.usedFallback,
        provider: aiResult.provider,
      },
      aiResult.usedFallback ? "未检测到 AI 配置，已用规则生成复盘" : "数据复盘生成成功"
    );
  } catch (error) {
    return apiError(error, "review.generate", "数据复盘失败");
  }
}
