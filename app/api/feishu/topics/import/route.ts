import { NextRequest } from "next/server";
import { apiError, apiOk, readJsonBody } from "../../_utils";
import { createFeishuRecords, searchFeishuRecords } from "@/lib/feishu";
import { scanTopicPool, type TopicPoolScanOptions } from "@/lib/topicPool";
import {
  filterUsableContentCards,
  mapContentCardToFeishuFields,
  normalizeContentCard,
  type ContentCard,
} from "@/lib/xhsWorkflow";

interface TopicPoolImportRequest extends TopicPoolScanOptions {
  /** 是否写回飞书；Demo 模式传 false 只返回种子。 */
  writeBack?: boolean;
}

function normalizeTitleKey(card: ContentCard): string {
  return (card.titleCandidates[0] || card.coreViewpoint || "").trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<TopicPoolImportRequest>(request, "topicPool.import.readJson");
    const writeBack = body.writeBack !== false;

    if (!writeBack) {
      const scanResult = await scanTopicPool({ sourceDir: body.sourceDir });
      return apiOk(
        { topics: scanResult.topics, sections: scanResult.sections, writeBack: false, imported: [], skipped: 0 },
        `已解析选题池 ${scanResult.topics.length} 条选题种子（未写入飞书）`
      );
    }

    // 解析本地文件与拉取飞书已有选题相互独立，并行执行。
    const [scanResult, existingRecords] = await Promise.all([
      scanTopicPool({ sourceDir: body.sourceDir }),
      searchFeishuRecords("topic"),
    ]);
    const seeds = scanResult.topics;
    const existingTopics = filterUsableContentCards(existingRecords.map(normalizeContentCard));
    const existingTopicIds = new Set(existingTopics.map((topic) => topic.topicId).filter(Boolean));
    const existingTitleKeys = new Set(existingTopics.map(normalizeTitleKey).filter(Boolean));

    const toCreate = seeds.filter(
      (seed) => !existingTopicIds.has(seed.topicId) && !existingTitleKeys.has(normalizeTitleKey(seed))
    );
    const skipped = seeds.length - toCreate.length;

    const writeResult =
      toCreate.length > 0
        ? await createFeishuRecords(
            "topic",
            toCreate.map((card) => ({ fields: mapContentCardToFeishuFields(card) }))
          )
        : null;

    return apiOk(
      {
        topics: seeds,
        sections: scanResult.sections,
        writeBack: true,
        imported: toCreate,
        skipped,
        writeResult,
      },
      `已写入飞书选题表 ${toCreate.length} 条，跳过重复 ${skipped} 条`
    );
  } catch (error) {
    return apiError(error, "topicPool.import", "选题池导入失败");
  }
}
