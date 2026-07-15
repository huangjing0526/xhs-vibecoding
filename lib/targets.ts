/**
 * 发布目标的素材尺寸。
 *
 * 覆盖画布的宽高，不覆盖画布内的布局坐标——lib/cover.ts 与 lib/imageWorkflow.ts
 * 的 draw* 仍以 1080 宽为基准写死排版（见改造方案 Phase 3）。
 */

export type TargetId = "xhs-post";

/** 取值与 lib/imageWorkflow.ts 的 ImageAssetKind 一致，两边可直接互相索引。 */
export type AssetKind = "cover" | "content";

export type AspectId = "3:4";

const ASPECT_PX: Record<AspectId, readonly [number, number]> = {
  "3:4": [1080, 1440],
};

const TARGET_ASSETS: Record<TargetId, Record<AssetKind, AspectId>> = {
  "xhs-post": { cover: "3:4", content: "3:4" },
};

/**
 * 改造期间的默认目标。数据模型尚未带 target 维度（见改造方案 Phase 2），
 * 各调用点暂时显式传入此常量，届时替换为草稿上的真实目标。
 */
export const DEFAULT_TARGET_ID: TargetId = "xhs-post";

export function assetPx(id: TargetId, kind: AssetKind): readonly [number, number] {
  return ASPECT_PX[TARGET_ASSETS[id][kind]];
}

/** 预览框用的 CSS aspect-ratio，由像素尺寸推导，杜绝预览与产物各自漂移。 */
export function assetRatioCss(id: TargetId, kind: AssetKind): string {
  const [width, height] = assetPx(id, kind);
  return `${width} / ${height}`;
}
