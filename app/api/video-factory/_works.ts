import { listProjects } from "@/app/api/video-factory/_shared";
import { clipUrl, finalCutUrl, type VideoWork } from "@/lib/videoFactory";

/**
 * 视频侧的作品列表：各项目的成片投影成 VideoWork。
 * 取流地址拼装、字段裁剪、老数据兜底都收在这里——聚合端点只拿结果合并，
 * 不必知道视频工厂的存储长什么样（对照图片侧 _works.ts 的 toWorkEntry）。
 */
export async function listVideoWorks(): Promise<VideoWork[]> {
  const projects = await listProjects();
  return projects.flatMap((project) => {
    const shots: VideoWork[] = project.clips.map((clip) => ({
      kind: "video" as const,
      id: `${project.id}/${clip.shotOrder}`,
      projectId: project.id,
      projectTitle: project.title,
      shotOrder: clip.shotOrder,
      provider: clip.provider,
      durationSec: clip.durationSec,
      resolution: clip.resolution,
      // 加 createdAt 之前落盘的老 clip 没有这个字段，按项目更新时间顶上，别让排序把它甩到最后
      createdAt: clip.createdAt || project.updatedAt,
      videoUrl: clipUrl(project.id, clip.shotOrder),
    }));
    const final = project.finalCut;
    if (!final) return shots;
    // 合成片的引擎和分辨率跟着第一镜走：各镜引擎不一致时只是个大概，作品库只拿它当来历参考
    const first = project.clips[0];
    return [
      {
        kind: "video" as const,
        id: `${project.id}/final`,
        projectId: project.id,
        projectTitle: project.title,
        shotOrder: 0,
        isFinal: true,
        provider: first?.provider ?? project.genProvider,
        durationSec: final.durationSec,
        resolution: first?.resolution,
        createdAt: final.createdAt,
        videoUrl: finalCutUrl(project.id),
      },
      ...shots,
    ];
  });
}
