/**
 * 发布目标的素材尺寸。
 *
 * 只覆盖画布宽高，不覆盖画布内的布局坐标——lib/cover.ts 与 lib/imageWorkflow.ts
 * 的 draw* 仍以 1080 宽为基准写死排版（见改造方案 Phase 3）。
 *
 * 读者只应在 app 层：lib/ 里的模块从调用方接收解析好的尺寸或比例，不反向查注册表。
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
 * 缺省目标：飞书记录没填目标、或手动新建条目时落到这里。
 * 目前只有一个目标，所以它既是缺省也是唯一值；接入第二个目标后仍是「拿不到目标时的兜底」。
 */
export const DEFAULT_TARGET_ID: TargetId = "xhs-post";

const ALL_TARGET_IDS: readonly TargetId[] = ["xhs-post"];

export function isTargetId(value: string): value is TargetId {
  return (ALL_TARGET_IDS as readonly string[]).includes(value);
}

/**
 * 解析选题「目标清单」（\n 连接）。
 *
 * 只兜「空」不兜「未知」：飞书可人工编辑，代码尚未注册的目标（Phase 4 前手填的 douyin-video 等）
 * 原样保留，与 status 字段同一策略——降级会在写回时静默覆盖人填的值。空清单兜底为缺省目标，
 * 因为选题至少要投一个目标。返回 string[] 而非 TargetId[]。
 */
export function parseTargets(text: string): string[] {
  const parsed = text
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(parsed));
  return unique.length > 0 ? unique : [DEFAULT_TARGET_ID];
}

/** 解析草稿/复盘「发布目标」（单值）。空兜底为缺省目标；非空的未知值原样保留（理由见 parseTargets）。 */
export function parseTarget(text: string): string {
  const value = text.trim();
  return value || DEFAULT_TARGET_ID;
}

export function serializeTargets(targets: string[]): string {
  return targets.join("\n");
}

export function assetAspect(id: TargetId, kind: AssetKind): AspectId {
  return TARGET_ASSETS[id][kind];
}

export function assetPx(id: TargetId, kind: AssetKind): readonly [number, number] {
  return ASPECT_PX[assetAspect(id, kind)];
}

/** 预览框用的 CSS aspect-ratio，由像素尺寸推导，杜绝预览与产物各自漂移。 */
export function assetRatioCss(id: TargetId, kind: AssetKind): string {
  const [width, height] = assetPx(id, kind);
  return `${width} / ${height}`;
}
