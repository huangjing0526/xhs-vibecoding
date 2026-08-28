import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { benchmarkClipPath, isSafeSegment, runCommand } from "@/app/api/video-factory/_shared";
import { readRhythm } from "@/app/api/video-factory/benchmark/_rhythm";
import { readProject } from "@/app/api/video-factory/_shared";
import {
  EDIT_PACK_MANIFEST_NAME,
  buildEditPackManifest,
  castNameMap,
  clippedShots,
  clipsAllowed,
} from "@/lib/videoFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ZIP_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * 把要走编辑通道的镜头打成一个包：原片段 + 一份「哪镜换什么」的清单。
 *
 * 存在的理由是工作量：三十镜的片子里十几镜要人拿去外部平台一个个跑，
 * 逐镜点开、逐个下载、再各自回想这一镜要换谁，光这一步就能耗掉一下午。
 *
 * 用系统 zip 而不是引一个打包库：这条线本来就在 spawn ffmpeg / python3 / whisper，
 * 为一个一年用不了几次的功能加一个依赖不划算。
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") || "";
  // 项目是可选的：没传就按对标里的说法写清单，人照样知道每一镜该换什么位置
  const projectId = params.get("project") || "";

  try {
    if (!isSafeSegment(id)) return new NextResponse("节奏 id 不合法", { status: 400 });

    const rhythm = await readRhythm(id);
    if (!rhythm) return new NextResponse("这份节奏模板不在了", { status: 404 });
    // 和 clip 端点同一道闸：包里装的就是原片段，出口都得守
    if (!clipsAllowed(rhythm)) {
      return new NextResponse("这条原片还没确认过水印，不能打包", { status: 403 });
    }

    const orders = clippedShots(rhythm);
    if (!orders.length) return new NextResponse("没有要走编辑通道的镜头，不用打包", { status: 400 });

    const project = projectId && isSafeSegment(projectId) ? await readProject(projectId) : null;
    const names = castNameMap(rhythm.cast, project?.castBinding);

    const work = await mkdtemp(path.join(tmpdir(), "edit-pack-"));
    try {
      // 只有清单要现写，片段直接从模板目录打进去——
      // zip -j 会拍平路径，而片段在盘上的名字和包里要的名字本来就是同一个（clipFileName），
      // 先复制一份到临时目录等于把几十兆白读白写一遍
      const manifest = path.join(work, EDIT_PACK_MANIFEST_NAME);
      await writeFile(manifest, buildEditPackManifest(rhythm, names), "utf8");

      const archive = path.join(work, "pack.zip");
      await runCommand(
        "zip",
        ["-j", "-q", archive, manifest, ...orders.map((order) => benchmarkClipPath(id, order))],
        { timeoutMs: ZIP_TIMEOUT_MS, timeoutMessage: "打包超时" },
      );
      const bytes = await readFile(archive);

      console.info("[VideoFactory] 编辑任务包已导出", {
        userId: "local",
        action: "videoFactory.benchmark.editPack",
        id,
        shots: orders.length,
        bytes: bytes.length,
      });
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "application/zip",
          // 文件名用 id 而不是 sourceLabel：标题里有书名号、井号和空格，进 header 要转义，不值当
          "Content-Disposition": `attachment; filename="edit-pack-${id}.zip"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    console.error("[VideoFactory] 编辑任务包导出失败", {
      userId: "local",
      action: "videoFactory.benchmark.editPack",
      id,
      error,
    });
    return new NextResponse("打包失败", { status: 500 });
  }
}
