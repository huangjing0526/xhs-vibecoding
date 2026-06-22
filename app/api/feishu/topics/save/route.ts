import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../_utils";
import { updateFeishuRecord } from "@/lib/feishu";
import { ContentCard, mapContentCardToFeishuFields } from "@/lib/xhsWorkflow";

interface SaveTopicRequest {
  topic?: ContentCard;
  writeBack?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<SaveTopicRequest>(request, "topics.save.readJson");
    const topic = body.topic;
    const writeBack = body.writeBack !== false;

    if (!topic) {
      return apiBadRequest("缺少选题内容");
    }

    let writeResult: unknown = null;
    if (writeBack) {
      if (!topic.recordId) {
        return apiBadRequest("选题缺少飞书记录 ID，无法保存");
      }
      writeResult = await updateFeishuRecord("topic", topic.recordId, mapContentCardToFeishuFields(topic));
    }

    return apiOk({ topic, writeBack, writeResult }, writeBack ? "选题已保存到飞书" : "选题已保存");
  } catch (error) {
    return apiError(error, "topics.save", "选题保存失败");
  }
}
