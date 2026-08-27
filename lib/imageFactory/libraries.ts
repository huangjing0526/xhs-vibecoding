import type { LibraryKind } from "./types";

export type { LibraryKind };

/**
 * 三种可复用参考素材库的文案表。
 * 模特 / 产品 / 场景的存法、增删、入库校验完全一样，差别只有「怎么称呼它」——
 * 分散在页面、结果区、路由里各写一遍必然漂移，所以全收在这一张表，加一种库只改这里。
 */
export interface LibraryCopy {
  /** 库名，如「模特库」 */
  label: string;
  /** 库里一条记录代表的主体，如「模特」 */
  subject: string;
  /** 特征描述输入框的占位提示 */
  traitsPlaceholder: string;
  /** 为什么值得填特征描述 */
  traitsHint: string;
  /** 空库时怎么把它填起来 */
  emptyHint: string;
}

/** 数组顺序即资产库里 tab 的先后。 */
export const LIBRARY_KINDS: LibraryKind[] = ["models", "products", "scenes"];

export const LIBRARY_COPY: Record<LibraryKind, LibraryCopy> = {
  models: {
    label: "模特库",
    subject: "模特",
    traitsPlaceholder: "体貌描述，例如：25 岁东亚女性，鹅蛋脸，齐肩黑直发，身高偏高体型偏瘦，气质清冷",
    traitsHint: "描述会连同图一起喂给后续生成——只给图锁不住脸，写清楚才换得了场景还是同一个人。",
    emptyHint: "去图片工厂跑一组模特资产，在结果区点「存入模特库」，之后每次生成都能直接取这位模特。",
  },
  products: {
    label: "产品库",
    subject: "商品",
    traitsPlaceholder: "款式材质描述，例如：米白色针织开衫，V 领，落肩袖，罗纹下摆，羊毛混纺哑光质感",
    traitsHint: "描述会连同图一起喂给后续生成——只给图锁不住货，写清楚才换得了场景还是同一件。",
    emptyHint: "去图片工厂跑电商白底图或服装三视图，在结果区点「存入产品库」，也可以直接上传自己拍的商品图。",
  },
  scenes: {
    label: "场景库",
    subject: "场景",
    traitsPlaceholder: "环境描述，例如：暖色木质门店，浅色墙面，射灯从上方打下，背景有虚化的衣架",
    traitsHint: "描述会连同图一起喂给后续生成——光线、材质、纵深写清楚，换主体时场景才不会走样。",
    emptyHint: "上传自己拍的门店、街景、桌面参考图，或者在图片工厂跑一张「空场景图」存入。",
  },
};

export const LIBRARY_LABEL = Object.fromEntries(
  LIBRARY_KINDS.map((kind) => [kind, LIBRARY_COPY[kind].label]),
) as Record<LibraryKind, string>;
