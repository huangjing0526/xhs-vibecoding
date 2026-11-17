import { apiError, apiOk } from "../../feishu/_utils";
import { hasFeishuConfig, searchFeishuRecords } from "@/lib/feishu";
import { normalizeBloggerNote, normalizeBloggerProfile } from "@/lib/blogger";
import { GET as listDaoku } from "../../daoku/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compatibility shape over the same profile/sample tables and desktop local daoku store.
export async function GET() {
  try {
    const daokuResponse = await listDaoku();
    const daoku = await daokuResponse.json();
    if (!daokuResponse.ok) throw new Error(daoku.message);
    const configured = hasFeishuConfig(["blogger", "bloggerNote"]);
    const [profiles, notes] = configured
      ? await Promise.all([searchFeishuRecords("blogger"), searchFeishuRecords("bloggerNote")])
      : [[], []];
    return apiOk({
      profiles: profiles.map(normalizeBloggerProfile), notes: notes.map(normalizeBloggerNote),
      distillations: daoku.data.distillations, configured,
    }, configured ? "读取对标数据成功" : "尚未配置对标表，采集结果可预览，保存需配置现有表");
  } catch (error) {
    return apiError(error, "blogger.list", "读取对标数据失败");
  }
}
