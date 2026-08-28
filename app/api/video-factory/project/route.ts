import { rm } from "node:fs/promises";
import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import {
  isSafeSegment,
  listProjects,
  newProjectId,
  projectDir,
  readProject,
  writeProject,
} from "@/app/api/video-factory/_shared";
import { DEFAULT_TARGET_DURATION_SEC, EMPTY_CAST, EMPTY_TOPIC_INPUT, type VideoProject } from "@/lib/videoFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 不带 id 取全部（按更新时间倒序），带 id 取一个。 */
export async function GET(request: NextRequest) {
  const projectId = new URL(request.url).searchParams.get("id") || "";
  try {
    if (!projectId) return apiOk({ projects: await listProjects() }, "项目列表已就绪");
    if (!isSafeSegment(projectId)) return apiBadRequest("项目 id 不合法");

    const project = await readProject(projectId);
    if (!project) return apiBadRequest("这个项目不存在或已被删除");
    return apiOk({ project }, "项目已读取");
  } catch (error) {
    return apiError(error, "videoFactory.project.get", "项目读取失败");
  }
}

/**
 * 整份覆盖保存。四步共用一个项目，前端每步结束存一次，刷新不丢。
 *
 * 唯一的例外是 clips：它归产物路由所有（generate 出片、clip 回传都在服务端写），
 * 这里一律以盘上的为准、不收前端送来的那份。否则页面开着时它手里的 clips 是旧的，
 * 一次自动存盘就能把扩展刚推回来的片子从项目里抹掉，只留一个孤儿 mp4 在盘上。
 * 前端要清空只能显式说 resetClips —— 重拆分镜是唯一会用到的场景。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<{ project?: Partial<VideoProject>; resetClips?: boolean }>(
      request,
      "videoFactory.project.readJson",
    );
    const incoming = body.project;
    if (!incoming) return apiBadRequest("缺少项目内容");

    const id = incoming.id && isSafeSegment(incoming.id) ? incoming.id : newProjectId();
    const existing = await readProject(id);
    const now = new Date().toISOString();

    const project: VideoProject = {
      id,
      title: (incoming.title || existing?.title || "").trim() || "未命名视频",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      skeleton: incoming.skeleton ?? existing?.skeleton ?? null,
      topic: incoming.topic ?? existing?.topic ?? EMPTY_TOPIC_INPUT,
      targetDurationSec: incoming.targetDurationSec ?? existing?.targetDurationSec ?? DEFAULT_TARGET_DURATION_SEC,
      rhythm: incoming.rhythm ?? existing?.rhythm ?? null,
      cast: incoming.cast ?? existing?.cast ?? EMPTY_CAST,
      // 老项目没有这个字段；空对象就是「一个实体都没绑」，语义正确
      castBinding: incoming.castBinding ?? existing?.castBinding ?? {},
      // 老项目没有这个字段，回落到加它之前唯一能生成的引擎
      genProvider: incoming.genProvider ?? existing?.genProvider ?? "grok-cli",
      script: incoming.script ?? existing?.script ?? null,
      storyboard: incoming.storyboard ?? existing?.storyboard ?? null,
      // 注意这里不看 incoming.clips，理由见上面的注释；voiceovers 和 finalCut 同理，
      // 都由合成路由在服务端写，前端手里那份随时可能是旧的
      clips: body.resetClips ? [] : existing?.clips ?? [],
      voiceovers: body.resetClips ? [] : existing?.voiceovers ?? [],
      finalCut: body.resetClips ? null : existing?.finalCut ?? null,
    };

    return apiOk({ project: await writeProject(project) }, "已保存");
  } catch (error) {
    return apiError(error, "videoFactory.project.save", "项目保存失败");
  }
}

/** 删项目：连同它的首帧图和成片一起删，不留孤儿文件。 */
export async function DELETE(request: NextRequest) {
  const projectId = new URL(request.url).searchParams.get("id") || "";
  try {
    if (!isSafeSegment(projectId)) return apiBadRequest("项目 id 不合法");
    await rm(projectDir(projectId), { recursive: true, force: true });
    return apiOk({ id: projectId }, "项目已删除");
  } catch (error) {
    return apiError(error, "videoFactory.project.delete", "项目删除失败");
  }
}
