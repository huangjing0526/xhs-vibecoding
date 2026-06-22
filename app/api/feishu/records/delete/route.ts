import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../_utils";
import { deleteFeishuRecord, type WorkflowTableName } from "@/lib/feishu";

interface DeleteRecordRequest {
  kind?: WorkflowTableName;
  recordId?: string;
}

const DELETABLE_KINDS: WorkflowTableName[] = ["material", "topic", "draft"];

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<DeleteRecordRequest>(request, "records.delete.readJson");
    const kind = body.kind;
    const recordId = body.recordId?.trim();

    if (!kind || !DELETABLE_KINDS.includes(kind)) {
      return apiBadRequest("缺少或不支持的记录类型");
    }
    if (!recordId) {
      return apiBadRequest("缺少记录 ID");
    }

    const deleteResult = await deleteFeishuRecord(kind, recordId);
    return apiOk({ kind, recordId, deleteResult }, "记录已从飞书删除");
  } catch (error) {
    return apiError(error, "records.delete", "记录删除失败");
  }
}
