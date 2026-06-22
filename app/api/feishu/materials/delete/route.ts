import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../_utils";
import { deleteFeishuRecord } from "@/lib/feishu";

interface DeleteMaterialRequest {
  recordId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<DeleteMaterialRequest>(request, "materials.delete.readJson");
    const recordId = body.recordId?.trim();

    if (!recordId) {
      return apiBadRequest("缺少素材记录 ID");
    }

    const deleteResult = await deleteFeishuRecord("material", recordId);
    return apiOk({ recordId, deleteResult }, "素材已从飞书删除");
  } catch (error) {
    return apiError(error, "materials.delete", "素材删除失败");
  }
}
