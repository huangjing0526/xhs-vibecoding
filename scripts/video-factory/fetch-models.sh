#!/usr/bin/env bash
# 拉 YuNet 人脸检测模型，逐镜量结构时用。
#
# 不装也能用：量化脚本会把需要人脸的指标标成 no-model，机位/节奏照测。
#
# 注意端点：opencv_zoo 的模型走 git-lfs，raw.githubusercontent.com 只会给你
# 一个 133 字节的指针文件，必须走 media.githubusercontent.com。
set -euo pipefail

# 默认落到 FACTORY_ROOT/models，和 _shared.ts 里的 FACE_MODELS_DIR 对齐。
# 从仓库根目录跑这个脚本。
DEST="${1:-.local/video-factory/models}"
BASE="https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models"

mkdir -p "$DEST"

fetch () {
  local url="$1" out="$2"
  if [ -s "$out" ] && [ "$(wc -c < "$out")" -gt 100000 ]; then
    echo "已存在，跳过：$(basename "$out")"
    return
  fi
  echo "下载 $(basename "$out") ..."
  curl -fsSL -o "$out" "$url"
  # LFS 指针文件是纯文本且只有一百多字节，用大小兜住这个坑
  if [ "$(wc -c < "$out")" -lt 100000 ]; then
    echo "下载到的是 LFS 指针而不是模型，检查端点是否为 media.githubusercontent.com" >&2
    rm -f "$out"
    exit 1
  fi
}

fetch "$BASE/face_detection_yunet/face_detection_yunet_2023mar.onnx" "$DEST/face_detection_yunet.onnx"

echo
echo "模型就绪：$DEST"
echo "还需要 python 依赖：pip3 install opencv-python-headless numpy"
