import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk } from "../../_utils";
import { batchUpdateFeishuRecords, createFeishuRecords, fieldToText, searchFeishuRecords } from "@/lib/feishu";
import { importNoteStats } from "@/lib/noteStats.mjs";

// 解析 xlsx 要用 node:zlib
export const runtime = "nodejs";

/** 创作服务平台导出一次最多 1000 条笔记，文件很小；给个宽松上限挡住误传的大文件 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** 复盘页「导入数据」：上传「笔记列表明细表.xlsx」。规则与命令行脚本同一份（lib/noteStats.mjs）。 */
export async function POST(request: NextRequest) {
  let fileName = "";
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return apiBadRequest("没收到文件，选一份「笔记列表明细表.xlsx」再导入");
    fileName = file.name;
    if (file.size > MAX_FILE_BYTES) return apiBadRequest("文件超过 10MB，不像是笔记数据导出表");

    const { records, updates, creates } = await importNoteStats(Buffer.from(await file.arrayBuffer()), {
      searchReviewRecords: () => searchFeishuRecords("review"),
      fieldToText,
      batchUpdate: (rows) => batchUpdateFeishuRecords("review", rows),
      batchCreate: (rows) => createFeishuRecords("review", rows),
    });

    const result = {
      parsed: records.length,
      updated: updates.length,
      linked: updates.filter((update) => update.linkedNoteId).length,
      created: creates.length,
    };
    console.info("[ReviewImport] 笔记数据已导入", { action: "review.import", fileName, ...result });
    return apiOk(result, "笔记数据已导入");
  } catch (error) {
    // xlsx 格式不对时解析抛的是说人话的 Error，apiError 会原样带给页面
    return apiError(error, "review.import", `导入「${fileName || "未知文件"}」失败`);
  }
}
