import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../feishu/_utils";
import { upsertFeishuRecords } from "@/lib/feishu";
import { BLOGGER_KEY_COLUMN, BLOGGER_NOTE_KEY_COLUMN, mapBloggerNoteToFeishuFields, mapBloggerProfileToFeishuFields } from "@/lib/blogger";
import type { BloggerDistillation, BloggerNote, BloggerProfile } from "@/lib/bloggerWorkflow";
import { toDesktopDistillation } from "@/lib/integration/blogger";
import { POST as saveDaoku } from "../../daoku/route";

export const runtime = "nodejs";
interface SaveRequest { profile?: BloggerProfile; notes?: BloggerNote[]; distillation?: BloggerDistillation }

// Collection writes profile/sample columns only. Slot-bearing daoku stays in the desktop local store.
export async function POST(request: NextRequest) {
  try {
    const { profile, notes = [], distillation } = await readJsonBody<SaveRequest>(request, "blogger.save.readJson");
    if (!profile && !notes.length && !distillation) return apiBadRequest("没有要保存的内容");
    if (distillation && !profile) return apiBadRequest("保存道库需要同时带上所属账号");
    const [profileResult, noteResult] = await Promise.all([
      profile ? upsertFeishuRecords("blogger", BLOGGER_KEY_COLUMN, [{ key: profile.id, fields: mapBloggerProfileToFeishuFields(profile) }]) : { created: 0, updated: 0 },
      upsertFeishuRecords("bloggerNote", BLOGGER_NOTE_KEY_COLUMN, notes.map((note) => ({ key: note.noteId, fields: mapBloggerNoteToFeishuFields(note) }))),
    ]);
    if (distillation && profile) {
      const response = await saveDaoku(new NextRequest("http://localhost/api/daoku", {
        method: "POST", body: JSON.stringify(toDesktopDistillation(distillation, profile)),
      }));
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(`账号与样本已保存，道库保存失败：${payload.message}`);
      }
    }
    return apiOk({ profile: profileResult, notes: noteResult }, "已保存到共享对标库");
  } catch (error) {
    return apiError(error, "blogger.save", "保存对标数据失败");
  }
}
