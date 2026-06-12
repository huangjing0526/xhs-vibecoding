import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk } from "../_utils";
import { searchFeishuRecords, WorkflowTableName } from "@/lib/feishu";
import {
  filterByStatus,
  filterUsableContentCards,
  filterUsableDrafts,
  filterUsableGlossary,
  filterUsableMaterials,
  filterUsableReviewMetrics,
  normalizeContentCard,
  normalizeDraftNote,
  normalizeGlossary,
  normalizeMaterial,
  normalizeReviewMetric,
} from "@/lib/xhsWorkflow";

const TABLES: WorkflowTableName[] = ["material", "glossary", "topic", "draft", "review"];

function isWorkflowTable(value: string | null): value is WorkflowTableName {
  return !!value && TABLES.includes(value as WorkflowTableName);
}

export async function GET(request: NextRequest) {
  const tableParam = request.nextUrl.searchParams.get("table");
  const status = request.nextUrl.searchParams.get("status") || undefined;
  const action = `sync.${tableParam || "all"}`;

  try {
    if (tableParam && !isWorkflowTable(tableParam)) {
      return apiBadRequest("不支持的飞书表类型");
    }

    if (tableParam === "material") {
      const records = await searchFeishuRecords("material");
      const materials = filterByStatus(filterUsableMaterials(records.map(normalizeMaterial)), status);
      return apiOk({ materials }, "读取素材库成功");
    }

    if (tableParam === "glossary") {
      const records = await searchFeishuRecords("glossary");
      return apiOk({ glossary: filterUsableGlossary(records.map(normalizeGlossary)) }, "读取术语库成功");
    }

    if (tableParam === "topic") {
      const records = await searchFeishuRecords("topic");
      const topics = filterByStatus(filterUsableContentCards(records.map(normalizeContentCard)), status);
      return apiOk({ topics }, "读取选题池成功");
    }

    if (tableParam === "draft") {
      const records = await searchFeishuRecords("draft");
      const drafts = filterByStatus(filterUsableDrafts(records.map(normalizeDraftNote)), status);
      return apiOk({ drafts }, "读取草稿库成功");
    }

    if (tableParam === "review") {
      const records = await searchFeishuRecords("review");
      return apiOk({ metrics: filterUsableReviewMetrics(records.map(normalizeReviewMetric)) }, "读取复盘数据成功");
    }

    const [materialRecords, glossaryRecords, topicRecords, draftRecords, reviewRecords] = await Promise.all([
      searchFeishuRecords("material"),
      searchFeishuRecords("glossary"),
      searchFeishuRecords("topic"),
      searchFeishuRecords("draft"),
      searchFeishuRecords("review"),
    ]);

    return apiOk(
      {
        materials: filterByStatus(filterUsableMaterials(materialRecords.map(normalizeMaterial)), status),
        glossary: filterUsableGlossary(glossaryRecords.map(normalizeGlossary)),
        topics: filterByStatus(filterUsableContentCards(topicRecords.map(normalizeContentCard)), status),
        drafts: filterByStatus(filterUsableDrafts(draftRecords.map(normalizeDraftNote)), status),
        metrics: filterUsableReviewMetrics(reviewRecords.map(normalizeReviewMetric)),
      },
      "读取飞书工作流数据成功"
    );
  } catch (error) {
    return apiError(error, action, "飞书同步失败");
  }
}
