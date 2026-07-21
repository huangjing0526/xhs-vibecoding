import { NextRequest, NextResponse } from "next/server";

// 注：这里是全部 /api 路由的共用工具（飞书、本地文档、改写都在用），
// 只是历史上落在 feishu/ 下。等 Phase 3 的封面改动落盘后可整体挪到 app/api/_utils.ts。

export async function readJsonBody<T>(request: NextRequest, action: string): Promise<T> {
  const text = await request.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("[API] JSON 解析失败", {
      userId: "local",
      action,
      error,
    });
    throw new Error("请求 JSON 格式不正确");
  }
}

export function apiOk<T>(data: T, message: string) {
  return NextResponse.json({ code: 0, data, message });
}

export function apiBadRequest(message: string) {
  return NextResponse.json({ code: 400, data: null, message }, { status: 400 });
}

export function apiError(error: unknown, action: string, fallbackMessage: string) {
  console.error("[API] 请求失败", {
    userId: "local",
    action,
    error,
  });
  return NextResponse.json(
    {
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : fallbackMessage,
    },
    { status: 500 }
  );
}
