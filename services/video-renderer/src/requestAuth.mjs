import { timingSafeEqual } from "node:crypto";

const PAID_PATH = /^\/(avatar|product)\/?$/i;
const COSTLY_PATH = /^\/(avatar|product|local|tts|render|extract)\/?$/i;

function isSameLocalOrigin(req, origin) {
  try {
    const url = new URL(origin);
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && origin === `${req.protocol || "http"}://${req.get("host")}`;
  } catch {
    return false;
  }
}

/** Server-to-server paid calls require a shared token. Local CLI/app calls stay compatible. */
export function rendererRequestAuth({ token = process.env.VIDEO_RENDERER_SERVICE_TOKEN || "" } = {}) {
  return (req, res, next) => {
    if (!COSTLY_PATH.test(req.path)) return next();
    const reject = (status, error) => {
      console.error("[video-renderer] Request rejected", { userId: "local", tenantId: "local", action: "renderer.authorize", path: req.path, status });
      return res.status(status).json({ error });
    };
    const origin = req.get("origin");
    if ((origin && !isSameLocalOrigin(req, origin)) || req.get("sec-fetch-site") === "cross-site") {
      return reject(403, "请通过内容工作台调用本地视频服务，不支持跨站浏览器请求");
    }
    if (!PAID_PATH.test(req.path)) return next();
    if (!token) return reject(503, "付费视频接口尚未配置服务认证，请在 app 与渲染服务配置相同的 VIDEO_RENDERER_SERVICE_TOKEN");
    const received = Buffer.from(req.get("authorization") || "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return reject(401, "视频服务认证失败，请检查 app 与渲染服务的 VIDEO_RENDERER_SERVICE_TOKEN 是否一致");
    }
    return next();
  };
}
