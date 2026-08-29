/**
 * 本地改口型：Wav2Lip。
 *
 * 走本机而不是云端，是因为这一步的输入是原片段——画面已经在手上了，
 * 只需要把嘴改成说新词。为这个再上传一遍到云端、再等一轮排队，
 * 不如让 CPU 慢慢磨：一条 7 秒的镜头约四分钟，不花钱，也不用把素材交出去。
 *
 * 模型和权重不进这个仓库（几百兆），装在本机 tools 目录下。没装就明说，
 * 别静默降级成「没改口型的成片」——那种片子人是看不出来的，发出去才发现口型对不上。
 */

import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { runCommand } from "@/app/api/video-factory/_shared";

/** 一条 7 秒的镜头实测约 227 秒，留足余量 */
const LIPSYNC_TIMEOUT_MS = 20 * 60 * 1000;

/** 没配 WAV2LIP_DIR 就找这儿。装法见 §环境依赖。 */
const DEFAULT_DIR = path.join(homedir(), "workspace", "tools", "Wav2Lip");

async function exists(target: string): Promise<boolean> {
  return access(target).then(() => true, () => false);
}

export interface LipsyncSetup {
  dir: string;
  checkpoint: string;
}

/** 本机能不能跑。缺什么就说缺什么，别让调用方猜。 */
export async function findLipsync(): Promise<{ setup: LipsyncSetup } | { missing: string }> {
  const dir = process.env.WAV2LIP_DIR || DEFAULT_DIR;
  if (!(await exists(path.join(dir, "inference.py")))) {
    return { missing: `没找到 Wav2Lip（${dir}），装好后设 WAV2LIP_DIR 指向它` };
  }
  const checkpoint = path.join(dir, "checkpoints", "wav2lip_gan.pth");
  if (!(await exists(checkpoint))) return { missing: `Wav2Lip 装了但缺权重：${checkpoint}` };
  return { setup: { dir, checkpoint } };
}

/**
 * 把 face 这段画面的嘴改成在说 audio。
 *
 * resize_factor 2 是实测的平衡点：Wav2Lip 只在 96 像素见方的区域里生成，
 * 送 1080 进去不会让嘴更清楚，只是让人脸检测多跑一倍时间。
 */
export async function runLipsync(face: string, audio: string, outfile: string): Promise<void> {
  const found = await findLipsync();
  if ("missing" in found) throw new Error(found.missing);

  // cwd 必须是 Wav2Lip 自己的目录：inference.py 按相对路径 import face_detection 等模块。
  // 代价是它的 temp/ 也在那儿且路径写死，所以同一时刻只能跑一条——
  // 两条并发会互相覆盖解出来的帧，出来的片子是两段拼接的怪东西。
  await runCommand(
    "python3",
    [
      "inference.py",
      "--checkpoint_path", found.setup.checkpoint,
      "--face", face,
      "--audio", audio,
      "--outfile", outfile,
      "--resize_factor", "2",
    ],
    {
      cwd: found.setup.dir,
      timeoutMs: LIPSYNC_TIMEOUT_MS,
      timeoutMessage: "改口型超时，换条短一点的镜头试试",
    },
  );
}
