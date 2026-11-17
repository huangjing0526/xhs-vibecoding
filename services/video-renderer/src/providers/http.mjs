/**
 * 云 API 的错误归一。
 *
 * 两家平台的失败信息藏在不同字段里（百炼是 code+message，硅基流动是 message/error），
 * 但处理方式一样：把原文带出来，别糊成「请求失败」——生视频的错误往往是「图片不合规」
 * 「余额不足」这种用户能自己解决的，吞掉就等于让人干瞪眼。
 */
export async function readApiError(response, { vendor, action }) {
  const text = await response.text().catch(() => "");

  let detail = text;
  try {
    const payload = JSON.parse(text);
    detail = [payload.code, payload.message || payload.error].filter(Boolean).join(": ") || text;
  } catch {
    // 非 JSON 响应（网关错误页等）就用原文
  }

  return new Error(`[${vendor}] ${action}失败（HTTP ${response.status}）：${detail || "无响应内容"}`);
}
