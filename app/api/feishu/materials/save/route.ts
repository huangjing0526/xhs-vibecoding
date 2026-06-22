import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../_utils";
import { updateFeishuRecord } from "@/lib/feishu";
import { MaterialItem, mapMaterialToFeishuFields } from "@/lib/xhsWorkflow";

interface SaveMaterialRequest {
  material?: MaterialItem;
  writeBack?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<SaveMaterialRequest>(request, "materials.save.readJson");
    const material = body.material;
    const writeBack = body.writeBack !== false;

    if (!material) {
      return apiBadRequest("缺少素材内容");
    }

    let writeResult: unknown = null;
    if (writeBack) {
      if (!material.recordId) {
        return apiBadRequest("素材缺少飞书记录 ID，无法保存");
      }
      writeResult = await updateFeishuRecord("material", material.recordId, mapMaterialToFeishuFields(material));
    }

    return apiOk({ material, writeBack, writeResult }, writeBack ? "素材已保存到飞书" : "素材已保存");
  } catch (error) {
    return apiError(error, "materials.save", "素材保存失败");
  }
}
