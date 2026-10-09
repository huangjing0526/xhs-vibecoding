import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../feishu/_utils";
import { createFeishuRecords, hasFeishuConfig, searchFeishuRecords } from "@/lib/feishu";
import { mapBloggerProfileToFeishuFields, normalizeBloggerProfile, normalizeBloggerSample } from "@/lib/bloggerFeishu";
import { DEMO_BLOGGER_PROFILES, DEMO_BLOGGER_SAMPLES, type BloggerProfile } from "@/lib/bloggerWorkflow";
import { newShortId } from "@/app/api/image-factory/_shared";

const BLOGGER_TABLES = ["blogger", "bloggerNote"] as const;

/** 对标博主和样本。两张对标表没配就给 demo，页面照样能演示蒸馏，只是存不住。 */
export async function GET() {
  try {
    if (!hasFeishuConfig([...BLOGGER_TABLES])) {
      return apiOk(
        { profiles: DEMO_BLOGGER_PROFILES, samples: DEMO_BLOGGER_SAMPLES, persisted: false },
        "未配置对标表，使用 Demo 博主"
      );
    }
    const [profileRecords, sampleRecords] = await Promise.all([
      searchFeishuRecords("blogger"),
      searchFeishuRecords("bloggerNote"),
    ]);
    return apiOk(
      {
        profiles: profileRecords.map(normalizeBloggerProfile).filter((profile) => profile.name),
        samples: sampleRecords.map(normalizeBloggerSample),
        persisted: true,
      },
      "已读取对标博主"
    );
  } catch (error) {
    return apiError(error, "bloggers.list", "读取对标博主失败");
  }
}

/** 新建一位对标博主（手动录入，不采集）。账号ID 由这里生成，页面不用管。 */
export async function POST(request: NextRequest) {
  const body = await readJsonBody<{ name?: string; platform?: string; positioning?: string; homepageUrl?: string }>(
    request,
    "bloggers.create.readJson"
  );
  try {
    const name = body.name?.trim();
    if (!name) return apiBadRequest("填一下博主名字");
    const profile: BloggerProfile = {
      id: `manual-${newShortId()}`,
      name,
      platform: body.platform?.trim() || "小红书",
      homepageUrl: body.homepageUrl?.trim() || undefined,
      positioning: body.positioning?.trim() || "",
      status: "手动录入",
    };
    await createFeishuRecords("blogger", [{ fields: mapBloggerProfileToFeishuFields(profile) }]);
    return apiOk({ profile }, `已添加博主「${name}」`);
  } catch (error) {
    return apiError(error, "bloggers.create", "添加博主失败");
  }
}
