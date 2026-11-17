import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../feishu/_utils";
import { COLLECT_PLATFORM_HINT, collectProfile, isCollectPlatform } from "@/lib/collector";

// 采集依赖本地 Playwright 服务，必须走 nodejs runtime 转发（与 /api/video/extract 同因）。
export const runtime = "nodejs";

interface ProfileRequest {
  platform?: string;
  homeUrl?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<ProfileRequest>(request, "blogger.profile.readJson");
    const homeUrl = body.homeUrl?.trim();
    if (!homeUrl) return apiBadRequest("请粘贴对标账号的主页链接");
    if (!isCollectPlatform(body.platform)) return apiBadRequest(COLLECT_PLATFORM_HINT);

    const profile = await collectProfile(body.platform, homeUrl);
    return apiOk({ profile }, `已添加账号，昵称与粉丝数将在采集笔记后回填`);
  } catch (error) {
    return apiError(error, "blogger.profile", "账号采集失败");
  }
}
