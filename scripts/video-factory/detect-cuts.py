#!/usr/bin/env python3
"""切镜点检测：PySceneDetect 的 AdaptiveDetector。

为什么不用 ffmpeg 的 scene 滤镜（那是这条线原来的做法）：
scene 是全局固定阈值的帧间像素差，同机位同场景下的切换差异太小，够不到阈值。
五条样本实测，ffmpeg 一刀都没多切，但漏掉 7 刀——而漏的全是换装、景别变化、
人物进出画面这类「同一个人在同一个地方」的切换，恰恰是对标复刻最要命的那几刀。

AdaptiveDetector 拿当前帧的差异值和滑动窗口内的邻域均值比，画面整体在晃时基线
跟着抬高，所以既不会被手持晃动骗到，也能认出低对比度的切换。

没装 scenedetect 就退出码 3，让调用方回落到 ffmpeg，而不是把整条拆解搞崩。
输出一行 JSON：{"cuts": [秒, ...]} 或 {"error": "..."}。
"""

import json
import sys


def main() -> int:
    if len(sys.argv) < 3:
        print(json.dumps({"error": "用法：detect-cuts.py <video> <adaptive_threshold> [min_scene_sec]"}))
        return 2
    source = sys.argv[1]
    threshold = float(sys.argv[2])
    # 低于这个长度的「镜头」基本是闪频误判，和 TS 侧的 MIN_SHOT_SEC 对齐
    min_scene_sec = float(sys.argv[3]) if len(sys.argv) > 3 else 0.3

    try:
        from scenedetect import AdaptiveDetector, detect, open_video
    except ImportError:
        print(json.dumps({"error": "没装 scenedetect"}))
        return 3

    try:
        # min_scene_len 的单位是帧，所以要先问出帧率——按 30fps 硬算的话，
        # 24fps 的片子会把 0.3 秒当成 0.375 秒，短镜头会被并掉
        fps = open_video(source).frame_rate or 30.0
        scenes = detect(
            source,
            AdaptiveDetector(
                adaptive_threshold=threshold,
                min_scene_len=max(1, round(min_scene_sec * fps)),
            ),
        )
    except Exception as error:  # noqa: BLE001 - 任何检测失败都回落，不区分类型
        print(json.dumps({"error": f"检测失败：{error}"}))
        return 1

    # 只回切点，不回场景区间：下游的 cutsToShots 要的就是切点，
    # 而且首尾由它补，这里多给反而要它去重
    cuts = [round(scene[0].seconds, 3) for scene in scenes][1:]
    print(json.dumps({"cuts": cuts}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
