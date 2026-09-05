import { groupInOrder } from "@/lib/collections";
import type { LibraryAssetEntry, LibraryKind, ModelAssetEntry } from "./types";

/**
 * 素材库里存的是一张张图，同名的属于同一个主体（同一位模特 / 同一件货 / 同一个场景）。
 * 按名字归成档案后，「选哪个主体」和「选它的哪张图」才是两件事——
 * 前者是列表页和下游模板真正要的，后者只在需要指定某张参考时才管。
 */
export interface AssetProfile {
  name: string;
  /** 主体特征描述，取这个主体身上第一条填过的；老资产可能没有 */
  traits: string;
  assets: LibraryAssetEntry[];
  /** 一眼认出这是谁 / 哪件货的那张：列表页当封面，下游模板当默认参考图 */
  cover: LibraryAssetEntry;
}

/**
 * 封面优先级：排在前面的视角先用，都没有就退回第一张。
 * 模特要的是脸——全身图缩成小卡片只剩一团衣服，认不出是谁；
 * 商品要的是正面主图；场景没有固定视角，入库第一张就是它。
 */
const COVER_PRIORITY: Record<LibraryKind, string[]> = {
  models: ["定妆近景", "正面头肩", "半身定妆", "正面全身"],
  products: ["正面主图", "正面", "45°侧面"],
  scenes: [],
};

function pickCover(assets: LibraryAssetEntry[], kind: LibraryKind): LibraryAssetEntry {
  for (const label of COVER_PRIORITY[kind]) {
    const matched = assets.find((asset) => asset.sourceLabel === label);
    if (matched) return matched;
  }
  return assets[0];
}

export function groupAssetProfiles(assets: LibraryAssetEntry[], kind: LibraryKind): AssetProfile[] {
  return groupInOrder(assets, (asset) => asset.name).map(({ key, items }) => ({
    name: key,
    traits: items.find((asset) => asset.traits)?.traits || "",
    assets: items,
    cover: pickCover(items, kind),
  }));
}

/** 模特档案。历史名字，保留给已有调用方。 */
export type ModelProfile = AssetProfile;

export function groupModelProfiles(assets: ModelAssetEntry[]): ModelProfile[] {
  return groupAssetProfiles(assets, "models");
}
