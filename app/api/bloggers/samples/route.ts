import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../feishu/_utils";
import { createFeishuRecords } from "@/lib/feishu";
import { mapBloggerSampleToFeishuFields } from "@/lib/bloggerFeishu";
import { makeManualSample } from "@/lib/bloggerWorkflow";
import { newShortId } from "@/app/api/image-factory/_shared";

/** 给一位博主添一条手动粘贴的样本，写进对标笔记表。笔记ID 由这里生成。 */
export async function POST(request: NextRequest) {
  const body = await readJsonBody<{ bloggerId?: string; title?: string; content?: string }>(
    request,
    "bloggers.samples.readJson"
  );
  try {
    const bloggerId = body.bloggerId?.trim();
    const title = body.title?.trim() || "";
    const content = body.content?.trim() || "";
    if (!bloggerId) return apiBadRequest("先选一位博主");
    if (!title && !content) return apiBadRequest("标题和正文至少填一样");
    const sample = makeManualSample(`sample-${newShortId()}`, { bloggerId, title, content });
    await createFeishuRecords("bloggerNote", [{ fields: mapBloggerSampleToFeishuFields(sample) }]);
    return apiOk({ sample }, "样本已存进对标笔记表");
  } catch (error) {
    return apiError(error, "bloggers.samples.create", "保存样本失败");
  }
}
