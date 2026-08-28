/**
 * 节奏模板的读写口。
 *
 * 存在的理由是「写盘前必须先让片段跟上路线」这条不变量：
 * 它以前靠三个写入点各自记得调 syncClips 维持，而新加的那个正好忘了，
 * 于是重拆之后上一版的原片段留在目录里没人删。
 * 收进这一个函数之后，第四个写入者不可能漏。
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { benchmarkDir } from "@/app/api/video-factory/_shared";
import { syncClips } from "@/app/api/video-factory/benchmark/_clips";
import type { BenchmarkRhythm } from "@/lib/videoFactory";

const rhythmFile = (benchmarkId: string) => path.join(benchmarkDir(benchmarkId), "rhythm.json");

/** 读一份节奏模板。不在了返回 null，由调用方决定说什么。 */
export async function readRhythm(benchmarkId: string): Promise<BenchmarkRhythm | null> {
  try {
    const parsed = JSON.parse(await readFile(rhythmFile(benchmarkId), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as BenchmarkRhythm) : null;
  } catch (error) {
    // 首次拆片前文件不存在是正常的，其余情况要留痕再按「没有」继续
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[VideoFactory] 节奏模板读取失败", {
        userId: "local",
        action: "videoFactory.benchmark.read",
        benchmarkId,
        error,
      });
    }
    return null;
  }
}

/** 让片段跟上当前路线，再落盘。返回的是真正写下去的那一份。 */
export async function writeRhythm(benchmarkId: string, rhythm: BenchmarkRhythm): Promise<BenchmarkRhythm> {
  const synced = await syncClips(benchmarkId, rhythm);
  await writeFile(rhythmFile(benchmarkId), JSON.stringify(synced, null, 2), "utf8");
  return synced;
}
