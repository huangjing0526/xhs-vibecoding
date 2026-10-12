import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../_utils";
import { batchUpdateFeishuRecords, fieldToText, searchFeishuRecords } from "@/lib/feishu";
import { generateWorkflowJson } from "@/lib/workflowAi";
import {
  buildReviewPrompt,
  createFallbackReview,
  filterMetricsByDraftStatus,
  filterUsableDrafts,
  hasReviewData,
  mapReviewConclusionToFeishuFields,
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
    const drafts = body.metrics
      ? null
      : filterUsableDrafts((await searchFeishuRecords("draft")).map(normalizeDraftNote));
    // 只复盘回填过数据的；刚标记发布、数全是 0 的行进来只会让模型分析一堆空数
    const withData = (body.metrics || records.map(normalizeReviewMetric)).filter(hasReviewData);
    const metrics = drafts ? filterMetricsByDraftStatus(withData, drafts) : withData;

    if (metrics.length === 0) {
      return apiBadRequest("没有回填过数据的笔记，先在复盘页导入创作服务平台的数据");
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
      nextActions: aiResult.result.nextActions || fallbackReview.nextActions,
      recordActions: aiResult.result.recordActions || fallbackReview.recordActions,
    };

    let writeResult: unknown = null;
    if (writeBack && records.length > 0) {
      const recordIdByNoteId = new Map(records.map((record) => [fieldToText(record.fields?.["笔记ID"]), record.record_id]));
      const updates = result.recordActions.flatMap((action) => {
        const recordId = recordIdByNoteId.get(action.noteId);
        if (!recordId) return [];
        return [{
          record_id: recordId,
          fields: mapReviewConclusionToFeishuFields({
            summary: result.summary,
            diagnosis: action.diagnosis,
            action: action.action,
            reason: action.reason,
          }),
        }];
      });
      writeResult = await batchUpdateFeishuRecords("review", updates);
    }

    return apiOk(
      {
        review: result,
        writeBack,
        writeResult,
        usedFallback: aiResult.usedFallback,
        provider: aiResult.provider,
      },
      aiResult.usedFallback ? "未检测到 AI 配置，已用规则生成复盘" : "数据复盘生成成功"
    );
  } catch (error) {
    return apiError(error, "review.generate", "数据复盘失败");
  }
}
