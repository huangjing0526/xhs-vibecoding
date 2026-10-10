/**
 * 项目里哪些字段归服务端写。
 *
 * 前端每次编辑都会整份自动存盘，而它手里那份随时可能是旧的：扩展推回来的片子、
 * 合成出来的成片、刚绑的素材，都是服务端路由直接写进 project.json 的。
 * 这些字段一律以盘上为准，保存接口不收前端送来的那份；前端存完再把它们接回来。
 * 归属规则只写在这一处，保存接口和前端各调一次，不再逐个字段各抄一遍。
 */

import { pruneCastBinding } from "./cast";
import { EMPTY_CAST, type Shot, type Storyboard, type VideoProject } from "./types";

export type ServerOwnedFields = Pick<
  VideoProject,
  "clips" | "voiceovers" | "finalCut" | "approvedFrameHashes" | "cast" | "castBinding"
>;

/** 把 from 里各镜的单镜素材按镜号盖到 shots 上；from 里没有的镜号就是没绑。 */
function overlayMaterials(shots: Shot[], from: Storyboard | null | undefined): Shot[] {
  const materials = new Map((from?.shots ?? []).map((shot) => [shot.order, shot.material]));
  // 没绑的镜头 material 是 undefined，存盘时 JSON 会把它整个丢掉
  return shots.map((shot) => ({ ...shot, material: materials.get(shot.order) }));
}

/**
 * 保存接口用：前端送来的项目 + 盘上那份 → 要落盘的服务端字段与分镜。
 *
 * reset 是重拆分镜：镜号全变了，挂在旧镜号上的片子、配音、首帧确认、单镜素材都作废。
 * 对标实体绑定不随它清——绑定按实体走，不按镜号走。
 */
export function mergeServerOwned(
  incoming: Partial<VideoProject>,
  existing: VideoProject | null,
  options: { reset?: boolean },
): ServerOwnedFields & Pick<VideoProject, "storyboard"> {
  const reset = Boolean(options.reset);
  const rhythm = incoming.rhythm ?? existing?.rhythm ?? null;
  const storyboard = incoming.storyboard ?? existing?.storyboard ?? null;
  const bindings = existing?.castBinding ?? {};

  return {
    clips: reset ? [] : existing?.clips ?? [],
    voiceovers: reset ? [] : existing?.voiceovers ?? [],
    finalCut: reset ? null : existing?.finalCut ?? null,
    approvedFrameHashes: reset ? [] : existing?.approvedFrameHashes ?? [],
    cast: existing?.cast ?? EMPTY_CAST,
    // 换了节奏，指向已消失实体的绑定要清掉，否则「已换 N 个」会虚高
    castBinding: rhythm ? pruneCastBinding(rhythm.cast, bindings) : bindings,
    storyboard: storyboard && {
      ...storyboard,
      shots: overlayMaterials(storyboard.shots, reset ? null : existing?.storyboard),
    },
  };
}

/** 前端用：存盘回来后，把服务端字段从盘上那份接回手里的项目，分镜只接单镜素材。 */
export function takeServerOwned(current: VideoProject, saved: VideoProject): VideoProject {
  return {
    ...current,
    clips: saved.clips,
    voiceovers: saved.voiceovers,
    finalCut: saved.finalCut,
    approvedFrameHashes: saved.approvedFrameHashes,
    cast: saved.cast,
    castBinding: saved.castBinding,
    storyboard: current.storyboard && {
      ...current.storyboard,
      shots: overlayMaterials(current.storyboard.shots, saved.storyboard),
    },
  };
}
