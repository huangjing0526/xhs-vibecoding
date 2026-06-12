import { NextRequest } from "next/server";
import { apiError, apiOk, readJsonBody } from "../../feishu/_utils";
import { createFeishuRecords, searchFeishuRecords } from "@/lib/feishu";
import { LocalDocsScanOptions, scanLocalDocs } from "@/lib/localDocs";
import {
  mapGlossaryToFeishuFields,
  mapMaterialToFeishuFields,
  normalizeGlossary,
  normalizeMaterial,
} from "@/lib/xhsWorkflow";

interface LocalDocsSyncRequest extends LocalDocsScanOptions {
  writeBack?: boolean;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<LocalDocsSyncRequest>(request, "localDocs.sync.readJson");
    const writeBack = body.writeBack !== false;
    const scanResult = await scanLocalDocs(body);

    const [materialRecords, glossaryRecords] = await Promise.all([
      searchFeishuRecords("material"),
      searchFeishuRecords("glossary"),
    ]);

    const existingMaterialIds = new Set(materialRecords.map(normalizeMaterial).map((item) => item.sourceId));
    const existingGlossaryTerms = new Set(
      glossaryRecords.map(normalizeGlossary).map((item) => normalizeKey(item.term)).filter(Boolean)
    );

    const materialsToCreate = scanResult.materials.filter((item) => !existingMaterialIds.has(item.sourceId));
    const glossaryToCreate = scanResult.glossary.filter((item) => !existingGlossaryTerms.has(normalizeKey(item.term)));

    let materialWriteResult: unknown = null;
    let glossaryWriteResult: unknown = null;
    if (writeBack) {
      materialWriteResult = await createFeishuRecords(
        "material",
        materialsToCreate.map((item) => ({ fields: mapMaterialToFeishuFields(item) }))
      );
      glossaryWriteResult = await createFeishuRecords(
        "glossary",
        glossaryToCreate.map((item) => ({ fields: mapGlossaryToFeishuFields(item) }))
      );
    }

    return apiOk(
      {
        ...scanResult,
        writeBack,
        importedMaterials: materialsToCreate,
        importedGlossary: glossaryToCreate,
        skippedMaterials: scanResult.materials.length - materialsToCreate.length,
        skippedGlossary: scanResult.glossary.length - glossaryToCreate.length,
        materialWriteResult,
        glossaryWriteResult,
      },
      writeBack ? "本地文档已写入飞书" : "本地文档同步预览成功"
    );
  } catch (error) {
    return apiError(error, "localDocs.sync", "本地文档写入飞书失败");
  }
}
