import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../_utils";
import { createFeishuRecords, searchFeishuRecords, updateFeishuRecord } from "@/lib/feishu";
import {
  createReviewMetricFromDraft,
  DraftNote,
  mapDraftToFeishuFields,
  mapReviewMetricToFeishuFields,
  normalizeReviewMetric,
  DRAFT_STATUS,
} from "@/lib/xhsWorkflow";

interface PublishDraftRequest {
  draft?: DraftNote;
  writeBack?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<PublishDraftRequest>(request, "drafts.publish.readJson");
    const draft = body.draft;
    const writeBack = body.writeBack !== false;

    if (!draft) {
      return apiBadRequest("缺少草稿内容");
    }

    const publishedDraft: DraftNote = { ...draft, status: DRAFT_STATUS.published };
    const reviewMetric = createReviewMetricFromDraft(publishedDraft);
    let draftWriteResult: unknown = null;
    let reviewWriteResult: unknown = null;

    if (writeBack) {
      if (!publishedDraft.recordId) {
        return apiBadRequest("草稿缺少飞书记录 ID，无法发布");
      }

      draftWriteResult = await updateFeishuRecord(
        "draft",
        publishedDraft.recordId,
        mapDraftToFeishuFields(publishedDraft)
      );

      const reviewRecords = await searchFeishuRecords("review");
      const existingReviewRecord = reviewRecords.find(
        (record) => normalizeReviewMetric(record).noteId === publishedDraft.noteId
      );
      const reviewFields = mapReviewMetricToFeishuFields(reviewMetric);

      reviewWriteResult = existingReviewRecord
        ? await updateFeishuRecord("review", existingReviewRecord.record_id, reviewFields)
        : await createFeishuRecords("review", [{ fields: reviewFields }]);
    }

    return apiOk(
      {
        draft: publishedDraft,
        reviewMetric,
        writeBack,
        writeResult: {
          draft: draftWriteResult,
          review: reviewWriteResult,
        },
      },
      writeBack ? "草稿已标记发布，复盘记录已准备" : "草稿已标记发布"
    );
  } catch (error) {
    return apiError(error, "drafts.publish", "草稿发布失败");
  }
}
