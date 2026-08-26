import type { WorkEntry } from "@/lib/imageFactory";
import type { VideoWork } from "@/lib/videoFactory";

/**
 * 统一的作品视图：作品 = 本机跑出来的全部产出，不管是哪个工厂跑的。
 * 各工厂的存储与形状归各自的模块管（ImageWork 即 WorkEntry，VideoWork 挨着 ShotClip 定义），
 * 这里只把两者并成一个能一起翻的 union——聚合发生在 /api/works，只读不写。
 */

/** 图片作品：图片工厂的产出，字段即 WorkEntry，多一个判别标（由聚合端点打）。 */
export type ImageWork = WorkEntry & { kind: "image" };

export type { VideoWork };

export type AnyWork = ImageWork | VideoWork;
