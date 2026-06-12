import { NextRequest } from "next/server";
import { apiError, apiOk, readJsonBody } from "../../feishu/_utils";
import { LocalDocsScanOptions, scanLocalDocs } from "@/lib/localDocs";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<LocalDocsScanOptions>(request, "localDocs.scan.readJson");
    const result = await scanLocalDocs(body);
    return apiOk(result, "本地文档扫描成功");
  } catch (error) {
    return apiError(error, "localDocs.scan", "本地文档扫描失败");
  }
}
