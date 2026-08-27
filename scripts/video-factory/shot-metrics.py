#!/usr/bin/env python3
"""
逐镜量出对标视频的结构：机位动没动、主体走近还是后退、节奏怎么分段。

为什么要量而不是让模型看：模型看关键帧会给你四平八稳的答案，
而「机位固定但人在后退」和「人不动但机位在推」在缩略图上长得一模一样。
这两件事对复刻的指导完全相反，猜错了整条片子的味道就错了。

用法：
    shot-metrics.py <video> <shots-json> [--models DIR] [--fps N]

shots-json 形如 [{"order":1,"startSec":0,"endSec":2.1}, ...]
结果 JSON 打到 stdout：{"shots":[{"order":1,"cameraMotion":"fixed",...}]}

—— 测不出来就说测不出来 ——
每项指标都有前置条件。条件不满足时输出 unavailable 原因，绝不填一个猜的数。
给使用者一个错的绿灯，比不给数危险得多。
"""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import cv2
    import numpy as np
except ImportError:
    print(json.dumps({"error": "opencv-python-headless / numpy 未安装"}), file=sys.stdout)
    sys.exit(0)


# 采样帧率。逐帧检测太贵，而结构指标在 12fps 上已经足够稳。
DEFAULT_FPS = 12
# 少于这么多采样帧就别测了，曲线拟合不出东西
MIN_FRAMES = 6
# 人脸窄于画宽这个比例，SFace 的特征就不可信了。
# 实测：75px 的脸算出来的向量会让相似度被系统性低估，
# 拿它跟一张清晰大脸比，会得出「身份漂移」的假结论。
MIN_FACE_WIDTH_RATIO = 0.045


def load_detector(models_dir: Path):
    """YuNet 人脸检测。模型不在就返回 None，让调用方标 no-model 而不是崩掉。"""
    onnx = models_dir / "face_detection_yunet.onnx"
    if not onnx.exists():
        return None
    try:
        return cv2.FaceDetectorYN.create(str(onnx), "", (320, 320), 0.6, 0.3, 5000)
    except Exception:
        return None


def extract_frames(video: Path, start: float, end: float, fps: int, out_dir: Path) -> list[Path]:
    """抽这一镜的采样帧。用 -ss/-t 精确到镜头区间。"""
    duration = max(end - start, 0.01)
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-v", "error",
            "-ss", f"{start:.3f}", "-t", f"{duration:.3f}",
            "-i", str(video),
            "-vf", f"fps={fps},scale=360:-2",
            "-q:v", "3",
            str(out_dir / "f%04d.jpg"),
        ],
        check=False,
    )
    # ffmpeg 从 1 开始编号，这里只按顺序用，不当帧号——
    # 把 f0001 当成第 0 帧会让所有时间轴整体偏移一帧。
    return sorted(out_dir.glob("f*.jpg"))


def background_strip(img):
    """画面左右两侧上部：主体没走近时这里是纯背景。"""
    h, w = img.shape[:2]
    top = img[: int(h * 0.18)]
    return np.concatenate([top[:, : int(w * 0.12)].ravel(), top[:, int(w * 0.88) :].ravel()]).astype(np.float32)


def measure_camera(frames: list) -> tuple[str, float, str | None]:
    """
    机位动没动：背景带在前半程的首末差。

    只看前半程——主体走近后会占住画面边缘，那时候的差异是遮挡不是机位。
    这个坑实测踩过：全程测会把「人走近」误判成「机位移动」。
    """
    half = frames[: max(3, len(frames) // 2)]
    strips = [background_strip(f) for f in half]
    drift = float(np.abs(strips[-1] - strips[0]).mean())

    # 边缘被主体占住时判据本身失效：用暗像素占比粗略地看一眼
    edge = strips[-1]
    if float((edge < 60).mean()) > 0.45:
        return "unknown", drift, "subject-edge"

    if drift < 6:
        return "fixed", drift, None
    if drift < 14:
        return "slight", drift, None
    return "moving", drift, None


def measure_faces(frames: list, detector) -> tuple[list[float], str | None]:
    """
    逐帧人脸宽度（占画宽的比例）。

    为什么用人脸宽：这是跨片段唯一稳的尺度代理。
    门框只在同场景内可用，发团面积遇棕发就失灵，
    服装色块会被腿部入画反向污染——三种都实测翻过车。
    """
    if detector is None:
        return [], "no-model"
    widths: list[float] = []
    for img in frames:
        h, w = img.shape[:2]
        detector.setInputSize((w, h))
        _, faces = detector.detect(img)
        if faces is None or len(faces) == 0:
            continue
        face = max(faces, key=lambda r: r[2] * r[3])
        widths.append(float(face[2]) / w)
    if not widths:
        return [], "no-face"
    if float(np.median(widths)) < MIN_FACE_WIDTH_RATIO:
        return widths, "face-too-small"
    return widths, None


def measure_tempo(widths: list[float]) -> dict | None:
    """
    节奏三段：静止 → 运动 → 定格 各占多少。

    爆款的节奏感就藏在这三段的配比里，而这个配比看缩略图看不出来。

    算法是「带符号位移 + 持续承诺」，两处都是被实测逼出来的：
    - 用带符号位移而不是绝对差分累加：后者会把静止段的抖动一路累起来，
      把「静 40 / 动 45 / 定 15」的片子读成「静 17 / 动 78 / 定 4」。
    - 用持续承诺而不是首次越过：人脸框会整档跳变（实测见过持续 6 帧的
      5% 漂移再弹回），首次越过会被这一跳骗到，把静止段读掉一半。

    ⚠️ 边界是近似的。12fps 采样下一帧就是 8%，加上人脸框本身的抖动，
    分段点有一到两帧的不确定度。要精确到帧的场合别用这个数。
    信噪比不够时直接返回 None，由调用方标 low-snr。
    """
    if len(widths) < MIN_FRAMES:
        return None
    series = np.array(widths, dtype=np.float64)
    # 先做一次三点滑动平均，压掉逐帧检测抖动
    if len(series) >= 5:
        kernel = np.ones(3) / 3
        series = np.convolve(series, kernel, mode="same")
        series[0], series[-1] = widths[0], widths[-1]

    # 带符号的净位移，不是绝对差分累加。
    # 绝对差分会把静止段的检测抖动一路累起来：10 帧各抖 0.005 就累出 0.05，
    # 和真实位移同量级，于是「静止段」被吃掉大半。带符号的话抖动正负抵消。
    displacement = series - series[0]
    total = float(series[-1] - series[0])
    if abs(total) < 0.02 * max(abs(series[0]), 1e-6):
        # 首末几乎没差：这一镜整体没有位移
        return {"holdPct": 1.0, "movePct": 0.0, "settlePct": 0.0}

    # 抖动地板：人脸框的尺寸会整档跳变（实测见过持续 6 帧的 5% 级别漂移）。
    # 跟真实位移同量级时，任何分段都是在给噪声编故事——那就不出这个数。
    noise = float(np.median(np.abs(np.diff(series))))
    if abs(total) < noise * 6:
        return None

    progress = displacement / total
    n = len(progress)

    # 「持续承诺」而不是「首次越过」：越过阈值后必须不再退回去。
    # 单看首次越过会被那次 5% 跳变骗到，把静止段读掉一半。
    def first_committed(level: float) -> int:
        for i in range(n):
            if progress[i] >= level and bool(np.all(progress[i:] >= level * 0.6)):
                return i
        return n - 1

    start = first_committed(0.15)
    end = first_committed(0.85)
    end = min(max(end, start), n - 1)

    hold = start / n
    settle = (n - 1 - end) / n
    move = max(0.0, 1.0 - hold - settle)
    return {
        "holdPct": round(hold, 3),
        "movePct": round(move, 3),
        "settlePct": round(settle, 3),
    }


def measure_shot(video: Path, shot: dict, fps: int, detector) -> dict:
    order = shot["order"]
    start = float(shot["startSec"])
    end = float(shot["endSec"])
    result: dict = {"order": order, "cameraMotion": "unknown"}
    unavailable: dict = {}

    with tempfile.TemporaryDirectory() as tmp:
        paths = extract_frames(video, start, end, fps, Path(tmp))
        frames = [cv2.imread(str(p)) for p in paths]
        frames = [f for f in frames if f is not None]

        if len(frames) < MIN_FRAMES:
            for key in ("cameraMotion", "subjectScaleRatio", "endFaceWidth", "tempo"):
                unavailable[key] = "too-short"
            result["unavailable"] = unavailable
            return result

        motion, drift, motion_reason = measure_camera(frames)
        result["cameraMotion"] = motion
        result["backgroundDrift"] = round(drift, 2)
        if motion_reason:
            unavailable["cameraMotion"] = motion_reason

        widths, face_reason = measure_faces(frames, detector)
        if face_reason:
            unavailable["subjectScaleRatio"] = face_reason
            unavailable["endFaceWidth"] = face_reason
            unavailable["tempo"] = face_reason
        else:
            head = float(np.mean(widths[:3]))
            tail = float(np.mean(widths[-3:]))
            if head > 0:
                result["subjectScaleRatio"] = round(tail / head, 3)
            result["endFaceWidth"] = round(tail, 4)
            tempo = measure_tempo(widths)
            if tempo:
                result["tempo"] = tempo
            else:
                # 位移量和检测抖动同量级，分段就是在给噪声编故事
                unavailable["tempo"] = "low-snr"
            # 尾段抖动：最后五个采样点的尺度极差。硬切要接得上，这个数要小
            tail_w = widths[-5:]
            if len(tail_w) >= 2:
                result["settleJitter"] = round(float(max(tail_w) - min(tail_w)), 4)

    if unavailable:
        result["unavailable"] = unavailable
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("shots")
    parser.add_argument("--models", default="")
    parser.add_argument("--fps", type=int, default=DEFAULT_FPS)
    args = parser.parse_args()

    video = Path(args.video)
    if not video.exists():
        print(json.dumps({"error": f"找不到视频：{video}"}))
        return

    shots = json.loads(Path(args.shots).read_text() if Path(args.shots).exists() else args.shots)
    detector = load_detector(Path(args.models)) if args.models else None

    out = [measure_shot(video, shot, args.fps, detector) for shot in shots]
    print(json.dumps({"shots": out}, ensure_ascii=False))


if __name__ == "__main__":
    main()
