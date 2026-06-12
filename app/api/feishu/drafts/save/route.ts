import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../_utils";
import { updateFeishuRecord } from "@/lib/feishu";
import { DraftNote, mapDraftToFeishuFields } from "@/lib/xhsWorkflow";

interface SaveDraftRequest {
  draft?: DraftNote;
  writeBack?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<SaveDraftRequest>(request, "drafts.save.readJson");
    const draft = body.draft;
    const writeBack = body.writeBack !== false;

    if (!draft) {
      return apiBadRequest("缺少草稿内容");
    }

    let writeResult: unknown = null;
    if (writeBack) {
      if (!draft.recordId) {
        return apiBadRequest("草稿缺少飞书记录 ID，无法保存");
      }
      writeResult = await updateFeishuRecord("draft", draft.recordId, mapDraftToFeishuFields(draft));
    }

    return apiOk({ draft, writeBack, writeResult }, writeBack ? "草稿已保存到飞书" : "草稿已保存");
  } catch (error) {
    return apiError(error, "drafts.save", "草稿保存失败");
  }
}
