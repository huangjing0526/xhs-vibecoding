import path from "node:path";
import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { readJsonFile, writeJsonFile } from "@/app/api/_localJson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 每条选题绑的是哪位博主的道库：{ topicId: bloggerId }。
 * 选题表没有这一列（加列算改表），先跟道库模板一样落在本机；放在 daoku 目录外，免得被模板目录当成一份道库列出来。
 */
const BINDINGS_FILE = path.join(process.cwd(), ".local", "daoku-bindings.json");

const readBindings = () => readJsonFile<Record<string, string>>(BINDINGS_FILE, {});

export async function GET() {
  try {
    return apiOk({ bindings: await readBindings() }, "已读取道库绑定");
  } catch (error) {
    return apiError(error, "daoku.bindings.read", "读取道库绑定失败");
  }
}

/** 绑定或解绑一条：bloggerId 为空即解绑。 */
export async function PUT(request: NextRequest) {
  const body = await readJsonBody<{ topicId?: string; bloggerId?: string }>(request, "daoku.bindings.readJson");
  try {
    const topicId = body.topicId?.trim();
    if (!topicId) return apiBadRequest("缺少选题ID");
    const bindings = await readBindings();
    if (body.bloggerId) bindings[topicId] = body.bloggerId;
    else delete bindings[topicId];
    await writeJsonFile(BINDINGS_FILE, bindings);
    return apiOk({ bindings }, body.bloggerId ? "已绑定道库" : "已解除道库绑定");
  } catch (error) {
    return apiError(error, "daoku.bindings.write", "保存道库绑定失败");
  }
}
