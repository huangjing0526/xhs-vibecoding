import { groupInOrder } from "@/lib/collections";
import type { ModelAssetEntry } from "./types";

/**
 * 模特库里存的是一张张图，同名的属于同一个人。
 * 按名字归成档案后，「选哪位模特」和「选她的哪个视角」才是两件事——
 * 前者是下游模板真正要的，后者只在需要指定某张参考时才管。
 */
export interface ModelProfile {
  name: string;
  /** 体貌描述，取这位模特身上第一条填过的；老资产可能没有 */
  traits: string;
  assets: ModelAssetEntry[];
  /** 最能锁住身份的那张，下游模板默认用它当参考图 */
  identity: ModelAssetEntry;
}

/** 锁脸优先级：定妆近景最稳，其次正面头肩，再不济拿手上第一张。 */
const IDENTITY_PRIORITY = ["定妆近景", "正面头肩", "半身定妆", "正面全身"];

function pickIdentity(assets: ModelAssetEntry[]): ModelAssetEntry {
  for (const label of IDENTITY_PRIORITY) {
    const matched = assets.find((asset) => asset.sourceLabel === label);
    if (matched) return matched;
  }
  return assets[0];
}

export function groupModelProfiles(assets: ModelAssetEntry[]): ModelProfile[] {
  return groupInOrder(assets, (asset) => asset.name).map(({ key, items }) => ({
    name: key,
    traits: items.find((asset) => asset.traits)?.traits || "",
    assets: items,
    identity: pickIdentity(items),
  }));
}
