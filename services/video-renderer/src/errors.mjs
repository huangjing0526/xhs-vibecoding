/**
 * 错误消息归一。
 *
 * msedge-tts 这类库会 reject 一个字符串或裸对象而不是 Error，直接 String() 出来就是
 * `[object Object]`，用户看了等于没看。所有对外暴露的失败信息都过这里。
 */
export function normalizeError(error) {
  if (error instanceof Error) return error.message;

  if (typeof error === "string") {
    return /connect/i.test(error)
      ? `${error}（edge-tts 无法连接微软语音服务，请检查本机网络/代理）`
      : error;
  }

  // msedge-tts 的连接失败常是个带 message/type 的裸对象，先捞可读字段再退回 JSON
  if (error && typeof error === "object") {
    const message = error.message || error.error || error.type || error.code;
    if (message) {
      return /connect/i.test(String(message))
        ? `${message}（edge-tts 无法连接微软语音服务，请检查本机网络/代理）`
        : String(message);
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "未知错误（无法序列化）";
    }
  }

  return "未知错误";
}
