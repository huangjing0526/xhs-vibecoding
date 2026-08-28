/**
 * 对标实体 ↔ 你自己的素材。
 *
 * 「借结构、换素材」这条线的最后一环：拆片认出对标里有哪几个人、哪几件货、哪几个地方，
 * 用户逐个绑上自己的素材，剩下的替换全是确定性的——描述里的 {角色1} 换成绑定的名字，
 * 首帧的参考图换成绑定的图。模型不参与「哪部分该换」的判断，所以同一份对标每次改写结果一致。
 *
 * 为什么不把绑定展开成 ProjectCast + 每镜 material 存一份：
 * 那等于把同一张图在项目目录里拷三遍，还得维护三份一致性。
 * 绑定本身就是单一事实来源，取参考图时按镜头现算。
 */

import { castToken, type BenchmarkCastEntity } from "./benchmark";
import type { CastRef } from "./types";

/** 键是占位符 token（「角色1」），值是绑上去的素材。 */
export type CastBinding = Record<string, CastRef>;

/**
 * token → 写进提示词的名字。
 * 绑了就用素材名，没绑就用它在对标里的说法——两种都比留个花括号强。
 */
export function castNameMap(
  cast: BenchmarkCastEntity[] | undefined,
  binding: CastBinding | undefined,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const entity of cast || []) {
    const token = castToken(entity);
    names.set(token, binding?.[token]?.label || entity.label);
  }
  return names;
}

/** 出现在对标第 N 镜的实体。 */
export function entitiesInShot(
  cast: BenchmarkCastEntity[] | undefined,
  sourceShotOrder: number | undefined,
): BenchmarkCastEntity[] {
  if (!sourceShotOrder) return [];
  return (cast || []).filter((entity) => entity.shots.includes(sourceShotOrder));
}

/**
 * 这一镜要带哪几张参考图。
 *
 * 只给绑了素材的实体——没绑的实体在提示词里已经用对标的说法描述过了，
 * 再塞一张对标原图当参考就成了搬运，那是这条线明确不做的事。
 */
export function shotCastRefs(
  cast: BenchmarkCastEntity[] | undefined,
  binding: CastBinding | undefined,
  sourceShotOrder: number | undefined,
): Array<{ entity: BenchmarkCastEntity; ref: CastRef }> {
  return entitiesInShot(cast, sourceShotOrder)
    .map((entity) => {
      const ref = binding?.[castToken(entity)];
      return ref ? { entity, ref } : null;
    })
    .filter((item): item is { entity: BenchmarkCastEntity; ref: CastRef } => Boolean(item));
}

export interface CastBindingProgress {
  total: number;
  bound: number;
  /** 还没绑素材的实体 token，界面上要点名，不能只报个数字 */
  pending: string[];
}

export function castBindingProgress(
  cast: BenchmarkCastEntity[] | undefined,
  binding: CastBinding | undefined,
): CastBindingProgress {
  const tokens = (cast || []).map((entity) => castToken(entity));
  const pending = tokens.filter((token) => !binding?.[token]);
  return { total: tokens.length, bound: tokens.length - pending.length, pending };
}

/**
 * 清掉指向已删实体的绑定。
 * 重测灵敏度会重拆一遍实体清单，老绑定里可能留着这次不存在的 token——
 * 留着不报错，但会让「已绑 5 个」这种计数虚高。
 */
export function pruneCastBinding(
  cast: BenchmarkCastEntity[] | undefined,
  binding: CastBinding | undefined,
): CastBinding {
  const known = new Set((cast || []).map((entity) => castToken(entity)));
  return Object.fromEntries(
    Object.entries(binding || {}).filter(([token]) => known.has(token)),
  );
}
