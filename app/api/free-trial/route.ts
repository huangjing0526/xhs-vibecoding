import { NextRequest, NextResponse } from "next/server";

const MAX_FREE_USES = 3;

export async function GET(request: NextRequest) {
  const sharedAvailable = !!process.env.SHARED_API_KEY;

  let remaining = MAX_FREE_USES;
  const cookie = request.cookies.get("vibenote_free_uses");
  if (cookie) {
    try {
      const data = JSON.parse(cookie.value);
      remaining = Math.max(0, MAX_FREE_USES - (data.count || 0));
    } catch {
      remaining = MAX_FREE_USES;
    }
  }

  return NextResponse.json({
    sharedAvailable,
    remaining,
    total: MAX_FREE_USES,
  });
}
