/**
 * 发布目标的素材尺寸。
 *
 * 只覆盖画布宽高，不覆盖画布内的布局坐标——lib/cover.ts 与 lib/imageWorkflow.ts
 * 的 draw* 仍以 1080 宽为基准写死排版（见改造方案 Phase 3）。
 *
 * 读者只应在 app 层：lib/ 里的模块从调用方接收解析好的尺寸或比例，不反向查注册表。
 */

export type TargetId = "xhs-post" | "wechat-article" | "douyin-note" | "zhihu-post";

/** 取值与 lib/imageWorkflow.ts 的 ImageAssetKind 一致，两边可直接互相索引。 */
export type AssetKind = "cover" | "content";

export type AspectId = "3:4" | "16:9" | "2.35:1" | "1:1";

const ASPECT_PX: Record<AspectId, readonly [number, number]> = {
  "3:4": [1080, 1440],
  "16:9": [1280, 720],
  "2.35:1": [900, 383],
  "1:1": [1080, 1080],
};

const TARGET_ASSETS: Record<TargetId, Record<AssetKind, AspectId>> = {
  "xhs-post": { cover: "3:4", content: "3:4" },
  "wechat-article": { cover: "2.35:1", content: "16:9" },
  "douyin-note": { cover: "3:4", content: "3:4" },
  "zhihu-post": { cover: "16:9", content: "16:9" },
};

/**
 * 缺省目标：飞书记录没填目标、或手动新建条目时落到这里。
 * 目前仍以 xhs-post 为缺省目标。
 */
export const DEFAULT_TARGET_ID: TargetId = "xhs-post";

export const ALL_TARGET_IDS: readonly TargetId[] = [
  "xhs-post",
  "wechat-article",
  "douyin-note",
  "zhihu-post",
];

export interface TargetMeta {
  id: TargetId;
  label: string;
  shortLabel: string;
  description: string;
  coverAspect: AspectId;
  contentAspect: AspectId;
  maxTitleChars: number;
  maxContentChars: number;
}

export const TARGET_METAS: Record<TargetId, TargetMeta> = {
  "xhs-post": {
    id: "xhs-post",
    label: "小红书图文",
    shortLabel: "小红书",
    description: "3:4 竖版封面，正文建议 400-800 字，重情绪与视觉冲击",
    coverAspect: "3:4",
    contentAspect: "3:4",
    maxTitleChars: 20,
    maxContentChars: 1000,
  },
  "wechat-article": {
    id: "wechat-article",
    label: "微信公众号",
    shortLabel: "公众号",
    description: "2.35:1 横版大图封面，支持深度长文排版与金句提炼",
    coverAspect: "2.35:1",
    contentAspect: "16:9",
    maxTitleChars: 64,
    maxContentChars: 30000,
  },
  "douyin-note": {
    id: "douyin-note",
    label: "抖音图文",
    shortLabel: "抖音图文",
    description: "3:4 竖版多图轮播，开头 3 秒抓眼球，文案短平快",
    coverAspect: "3:4",
    contentAspect: "3:4",
    maxTitleChars: 30,
    maxContentChars: 1000,
  },
  "zhihu-post": {
    id: "zhihu-post",
    label: "知乎图文",
    shortLabel: "知乎",
    description: "16:9 横版头图，重逻辑框架、真实经验与硬干货展开",
    coverAspect: "16:9",
    contentAspect: "16:9",
    maxTitleChars: 50,
    maxContentChars: 20000,
  },
};

export function getTargetMeta(id: string): TargetMeta {
  if (isTargetId(id)) return TARGET_METAS[id];
  return TARGET_METAS[DEFAULT_TARGET_ID];
}

export function isTargetId(value: string): value is TargetId {
  return (ALL_TARGET_IDS as readonly string[]).includes(value as TargetId);
}

/**
 * 解析选题「目标清单」（\n 连接）。
 *
 * 只兜「空」不兜「未知」：飞书可人工编辑，代码尚未注册的目标
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
  return (TARGET_ASSETS[id] || TARGET_ASSETS[DEFAULT_TARGET_ID])[kind];
}

export function assetPx(id: TargetId, kind: AssetKind): readonly [number, number] {
  return ASPECT_PX[assetAspect(id, kind)];
}

/** 预览框用的 CSS aspect-ratio，由像素尺寸推导，杜绝预览与产物各自漂移。 */
export function assetRatioCss(id: TargetId, kind: AssetKind): string {
  const [width, height] = assetPx(id, kind);
  return `${width} / ${height}`;
}
