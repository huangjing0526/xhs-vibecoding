/**
 * 说话镜怎么做出来。
 *
 * 两条路不是同一件事的两个实现，别混着看：
 * - lipsync：画面已经有了（实拍的、或编辑通道换完主体的），只把嘴改成说新词
 * - avatar：不要原画面，从零生成一个数字人在说话
 *
 * 前者保住了对标的构图、光线和现场感，探店这类片子靠的就是这个；
 * 后者胜在口型天生对、脸多大都不糊，但生成出来的是另一个人在另一个地方。
 */

import type { BenchmarkRhythm, BenchmarkShot } from "./benchmark";

export type TalkingApproach = "lipsync" | "avatar";

export const TALKING_APPROACH_LABEL: Record<TalkingApproach, string> = {
  lipsync: "改口型",
  avatar: "数字人",
};

/**
 * 本地口型模型（Wav2Lip）的生成区域是 96 像素见方，贴回原尺寸时放大多少倍就糊多少。
 *
 * 实测：脸宽 150 像素（放大 1.6 倍）在竖屏短视频里看不出来；
 * 200 像素往上（放大 2 倍多）嘴部的模糊和色差就藏不住了，那种镜头交给数字人。
 * 判的是像素不是占比——同样占画宽 20%，1080 宽的片子脸比 720 的大一半。
 */
export const LIPSYNC_FACE_PIXELS = 160;

export interface TalkingPlan {
  approach: TalkingApproach;
  /** 这一镜末帧的脸有多宽，像素。量不到就没有 */
  facePixels?: number;
  /** 为什么是这条路，一句话 */
  why: string;
}

/**
 * 给一个说话镜挑路子。
 *
 * 量不到脸宽时给 lipsync 而不是 avatar：本地那条不花钱，试了不合适再换；
 * 反过来先花钱生成一个数字人，发现原画面其实够用，钱已经出去了。
 */
export function planTalkingShot(rhythm: BenchmarkRhythm, shot: BenchmarkShot): TalkingPlan {
  const ratio = shot.metrics?.endFaceWidth;
  if (!ratio || !rhythm.width) {
    return { approach: "lipsync", why: "量不到脸有多大，先按本地改口型试——不花钱，不合适再换数字人" };
  }
  const facePixels = Math.round(ratio * rhythm.width);
  return facePixels > LIPSYNC_FACE_PIXELS
    ? {
        approach: "avatar",
        facePixels,
        why: `脸宽 ${facePixels} 像素，本地口型模型只有 96 像素的生成区域，放大到这个尺寸嘴部会糊`,
      }
    : {
        approach: "lipsync",
        facePixels,
        why: `脸宽 ${facePixels} 像素，本地改口型就够，画面还是对标那个现场`,
      };
}
