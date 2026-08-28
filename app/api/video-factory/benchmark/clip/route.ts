import { NextRequest, NextResponse } from "next/server";
import { benchmarkClipPath, isSafeSegment } from "@/app/api/video-factory/_shared";
import { serveVideoFile } from "@/app/api/video-factory/_serveVideo";
import { readRhythm } from "@/app/api/video-factory/benchmark/_rhythm";
import { clipsAllowed } from "@/lib/videoFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 取某一镜从原片切下来的片段，给人在界面上先看一眼再决定要不要拿去编辑。
 *
 * 复用成片那套 Range 流式回法：一屏十几个 <video> 各自只取头上几十 KB，
 * 整条读进内存的话光是打开面板就要读几十兆。
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") || "";
  const shot = Number(params.get("shot") || 0);
  if (!isSafeSegment(id)) return new NextResponse("节奏 id 不合法", { status: 400 });
  if (!Number.isInteger(shot) || shot < 1 || shot > 999) return new NextResponse("镜号不合法", { status: 400 });

  // 闸门也要守在出口。撤销确认时文件会被删，但那是写入方的副作用，
  // 把不变量寄托在某个写入者身上，任何新的产出路径都能绕过去。
  const rhythm = await readRhythm(id);
  if (!rhythm) return new NextResponse("这份节奏模板不在了", { status: 404 });
  if (!clipsAllowed(rhythm)) return new NextResponse("这条原片还没确认过水印，片段不给用", { status: 403 });

  return serveVideoFile(request, benchmarkClipPath(id, shot), "这一镜没有切出原片段");
}
