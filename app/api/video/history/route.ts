import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../feishu/_utils";
import { hasFeishuConfig, nowTimestampText, searchFeishuRecords, upsertFeishuRecords } from "@/lib/feishu";
import {
  VIDEO_EXTRACT_KEY_COLUMN,
  mapVideoExtractToFeishuFields,
  normalizeVideoExtractRecord,
} from "@/lib/videoExtractHistory";
import { toVideoExtractRecord, type VideoExtractResult } from "@/lib/videoExtract";

export const runtime = "nodejs";

/** 读拆片历史。表没配时回空列表 + configured:false，让前端提示建表而不是报错。 */
export async function GET() {
  try {
    if (!hasFeishuConfig(["videoExtract"])) {
      return apiOk(
        { records: [], configured: false },
        "尚未配置拆片记录表，请配置现有 FEISHU_VIDEO_EXTRACT_TABLE_ID；本整合不会自动建表"
      );
    }

    const records = await searchFeishuRecords("videoExtract");
    return apiOk(
      {
        // 按拆片时间倒序：最近拆的排最前。时间是 `YYYY-MM-DD HH:mm` 定长文本，字典序即时间序
        records: records
          .map(normalizeVideoExtractRecord)
          .sort((a, b) => b.extractedAt.localeCompare(a.extractedAt)),
        configured: true,
      },
      "读取拆片历史成功"
    );
  } catch (error) {
    return apiError(error, "video.history.list", "读取拆片历史失败");
  }
}

interface SaveRequest {
  result?: VideoExtractResult;
}

/**
 * 存一条拆片历史。收的是拆片结果原件、由本层映射成记录：
 * 拆片时间用服务端时钟，客户端时钟不可信；映射规则也不必外泄给前端。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<SaveRequest>(request, "video.history.readJson");
    const result = body.result;
    if (!result?.video?.sourceUrl) return apiBadRequest("没有要保存的拆片结果");

    if (!hasFeishuConfig(["videoExtract"])) {
      return apiBadRequest("尚未配置拆片记录表，请配置现有 FEISHU_VIDEO_EXTRACT_TABLE_ID；本整合不会自动建表");
    }

    const record = toVideoExtractRecord(result, nowTimestampText());

    const saved = await upsertFeishuRecords("videoExtract", VIDEO_EXTRACT_KEY_COLUMN, [
      { key: record.extractId, fields: mapVideoExtractToFeishuFields(record) },
    ]);

    return apiOk(saved, saved.created ? "已存入拆片历史" : "已更新拆片历史里的这条");
  } catch (error) {
    return apiError(error, "video.history.save", "保存拆片历史失败");
  }
}
