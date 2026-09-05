import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";

/**
 * 按 Range 流式回一个视频文件。
 *
 * 流式 + Range + ETag，三件事都是为了别把整条片子白读进内存：
 * 一屏十几个 <video preload="metadata"> 只各要头上几十 KB，拖进度条只要选中那段。
 * 少了 Content-Length 更要命——浏览器拿不到总长度就没法起播，表现是点了播放一直停在 0:00。
 * 同一个文件重跑会被覆盖所以不能长缓存，但 no-cache + ETag 让没变的回访走 304，一个字节都不读。
 */

/**
 * 解析单段 Range 头。没有 Range 回 null（整条 200）；格式或范围站不住回 "invalid"（416）。
 * 只支持单段——<video> 只发单段，多段 multipart 没有消费者。
 */
export function parseRange(header: string | null, size: number): [number, number] | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return "invalid";
  if (!match[1]) {
    // 后缀式 bytes=-N：最后 N 字节
    const suffix = Number(match[2]);
    if (suffix === 0) return "invalid";
    return [Math.max(0, size - suffix), size - 1];
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || start > end) return "invalid";
  return [start, end];
}

/** 文件不存在或是空的时候回这句，由调用方决定文案。 */
export async function serveVideoFile(
  request: NextRequest,
  file: string,
  notFoundMessage: string,
): Promise<NextResponse> {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || info.size === 0) return new NextResponse(notFoundMessage, { status: 404 });

  const etag = `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
  const baseHeaders = { ETag: etag, "Cache-Control": "no-cache", "Accept-Ranges": "bytes" };
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: baseHeaders });
  }

  const range = parseRange(request.headers.get("range"), info.size);
  if (range === "invalid") {
    return new NextResponse("请求的范围不合法", {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${info.size}` },
    });
  }

  const [start, end] = range ?? [0, info.size - 1];
  const stream = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream;
  return new NextResponse(stream, {
    status: range ? 206 : 200,
    headers: {
      ...baseHeaders,
      "Content-Type": "video/mp4",
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${info.size}` } : {}),
    },
  });
}
