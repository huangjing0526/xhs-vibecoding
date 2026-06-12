import { NextRequest, NextResponse } from "next/server";

export async function readJsonBody<T>(request: NextRequest, action: string): Promise<T> {
  const text = await request.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("[FeishuAPI] JSON 解析失败", {
      userId: "local",
      tenantId: "feishu",
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
  console.error("[FeishuAPI] 请求失败", {
    userId: "local",
    tenantId: "feishu",
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
