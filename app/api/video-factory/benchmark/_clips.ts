/**
 * 按镜切原片段：走编辑通道的镜头，要拿原片的这一段去换主体。
 *
 * 只切判为 edit 的那些镜头。一条 30 镜的片子全切就是几百兆，
 * 而直接生成的镜头拿到原片段也没有用武之地——首帧图那条路根本不吃视频。
 *
 * 切出来的片段一律去掉音轨：原声不进下游这条没变，编辑模型也不需要它。
 */

import { readdir, stat, unlink } from "node:fs/promises";
import { benchmarkClipPath, benchmarkDir, benchmarkSourcePath, runCommand } from "@/app/api/video-factory/_shared";
import {
  clipShotOrders,
  clipsAllowed,
  type BenchmarkRhythm,
  type BenchmarkShot,
  type BenchmarkShotClip,
} from "@/lib/videoFactory";

const CLIP_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * 切一镜。
 *
 * 重编码而不是 -c copy：copy 只能从关键帧切，起点会甩出去零点几秒，
 * 而这条线的整个价值就在切点准。preset veryfast 下几秒的片段是毫秒级的事，不值得省。
 * pix_fmt 钉死 yuv420p——不钉的话有些源会编出 4:4:4，浏览器直接放不出来。
 */
async function cutOne(source: string, shot: BenchmarkShot, target: string): Promise<BenchmarkShotClip> {
  await runCommand(
    "ffmpeg",
    [
      "-hide_banner", "-v", "error",
      "-accurate_seek",
      "-ss", shot.startSec.toFixed(3),
      "-i", source,
      "-t", shot.durationSec.toFixed(3),
      "-an",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-y", target,
    ],
    { timeoutMs: CLIP_TIMEOUT_MS, timeoutMessage: "切片超时" },
  );
  const info = await stat(target);
  return { durationSec: shot.durationSec, bytes: info.size };
}

/**
 * 把要走编辑通道的镜头逐个切出来。
 *
 * 单镜失败只丢那一镜：一条片子里有一镜切不动，不该把另外二十镜的成果一起作废。
 * 返回的表里没有的镜号就是没切成，界面按「有没有 clip」判断能不能进编辑通道，
 * 不拿路线去推——路线说该切，不等于切成了。
 */
export async function cutClips(
  benchmarkId: string,
  source: string,
  shots: BenchmarkShot[],
): Promise<Map<number, BenchmarkShotClip>> {
  const out = new Map<number, BenchmarkShotClip>();
  for (const shot of shots) {
    const target = benchmarkClipPath(benchmarkId, shot.order);
    try {
      out.set(shot.order, await cutOne(source, shot, target));
    } catch (error) {
      console.warn("[VideoFactory] 切片失败，这一镜没有原片段", {
        action: "videoFactory.benchmark.clip",
        benchmarkId,
        shot: shot.order,
        error: error instanceof Error ? error.message : String(error),
      });
      // 失败可能留下一个半截文件，删掉——留着会让下游以为这一镜切成了
      await unlink(target).catch(() => {});
    }
  }
  return out;
}

/**
 * 盘上现在有哪几镜的片段。
 *
 * 读目录而不是读 rhythm.json 里的 clip 字段：重拆会写出一份全新的、不带 clip 的 rhythm，
 * 照着它收敛的话上一版切下来的文件没人删，会一直留在目录里。
 * 收敛函数要对着真实状态收敛，不是对着另一份可能已被覆盖的描述。
 */
async function clipsOnDisk(benchmarkId: string): Promise<number[]> {
  const entries = await readdir(benchmarkDir(benchmarkId)).catch(() => [] as string[]);
  return entries
    .map((name) => /^clip-(\d+)\.mp4$/.exec(name))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => Number(match[1]));
}

/** 删掉这几镜的片段。 */
async function dropClips(benchmarkId: string, orders: number[]): Promise<void> {
  for (const order of orders) {
    await unlink(benchmarkClipPath(benchmarkId, order)).catch(() => {});
  }
}

/**
 * 让磁盘上的片段和当前的路线判定对上。
 *
 * 一律重切而不是增量补：重看一遍片之后镜头边界可能已经变了（灵敏度一调就全变），
 * 同一个镜号下的旧片段指向的是另一段画面。切一段几秒的片子是毫秒级的事，
 * 不值得为省这点时间冒「第 12 镜的片段其实是上一版第 12 镜」的险。
 *
 * 水印没确认就一段都不切，并且把已有的全删掉——闸门要落到磁盘上，
 * 只在界面上灰掉按钮的话，文件还躺在那儿，下一个读它的人不知道它没过闸。
 */
export async function syncClips(benchmarkId: string, rhythm: BenchmarkRhythm): Promise<BenchmarkRhythm> {
  const wanted = rhythm.report && clipsAllowed(rhythm) ? new Set(clipShotOrders(rhythm.report)) : new Set<number>();

  // 先清空再重切：wanted 的那些下一行就会重新切出来，剩下的本来就该消失。
  // 闸门关着时这一步等于全删——闸门要落到磁盘上，不能只在界面上灰掉按钮。
  await dropClips(benchmarkId, await clipsOnDisk(benchmarkId));

  const clips = wanted.size
    ? await cutClips(
        benchmarkId,
        benchmarkSourcePath(benchmarkId),
        rhythm.shots.filter((shot) => wanted.has(shot.order)),
      )
    : new Map<number, BenchmarkShotClip>();

  return {
    ...rhythm,
    shots: rhythm.shots.map(({ clip: _stale, ...rest }) => {
      const clip = clips.get(rest.order);
      return clip ? { ...rest, clip } : rest;
    }),
  };
}
