/**
 * 硅基流动适配：图生视频 Wan-AI/Wan2.2-I2V-A14B，用于「产品展示」那条产线。
 *
 * 两个要小心的地方：
 * 1. 结果 URL 只有 10 分钟有效期 —— 拿到就必须立刻下载落盘，不能攒着最后一起下；
 * 2. 图片可以直接给 data URL，不用先上传，所以这条链路比数字人少一次往返。
 *
 * 文档：https://docs.siliconflow.cn/cn/api-reference/videos/videos_submit
 */

import { readApiError } from "./http.mjs";

const BASE = "https://api.siliconflow.cn/v1";
export const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B";

/** 平台只接受这三种尺寸，竖版短视频用 720x1280。 */
export const I2V_SIZES = ["720x1280", "1280x720", "960x960"];

function requireApiKey() {
  const key = process.env.SILICONFLOW_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "未配置 SILICONFLOW_API_KEY。产品展示走硅基流动图生视频，请在 services/video-renderer/.env 里配置。"
    );
  }
  return key;
}

/** 开跑前先确认 key 在，理由同 bailian.mjs。 */
export function assertConfigured() {
  requireApiKey();
}

/** 提交一张图的图生视频任务，返回 requestId。 */
export async function submitImageToVideo({ image, prompt, imageSize = "720x1280", negativePrompt, seed }) {
  const apiKey = requireApiKey();

  const response = await fetch(`${BASE}/video/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: I2V_MODEL,
      prompt,
      image,
      image_size: imageSize,
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      ...(seed === undefined ? {} : { seed }),
    }),
  });

  if (!response.ok) throw await readApiError(response, { vendor: "硅基流动", action: "提交图生视频" });

  const payload = await response.json();
  const requestId = payload?.requestId;
  if (!requestId) {
    throw new Error(`[硅基流动] 提交成功但没拿到 requestId：${JSON.stringify(payload).slice(0, 400)}`);
  }
  return requestId;
}

/** 轮询直到出片，返回视频 URL。注意调用方要马上下载，URL 只活 10 分钟。 */
export async function waitForVideo({ requestId, onTick, intervalMs = 6000, timeoutMs = 15 * 60 * 1000 }) {
  const apiKey = requireApiKey();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`${BASE}/video/status`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    if (!response.ok) throw await readApiError(response, { vendor: "硅基流动", action: "查询图生视频状态" });

    const payload = await response.json();
    const status = payload?.status;

    if (status === "Succeed") {
      const url = payload?.results?.videos?.[0]?.url;
      if (!url) throw new Error("[硅基流动] 任务成功但结果里没有视频地址");
      return url;
    }
    if (status === "Failed") {
      throw new Error(`[硅基流动] 图生视频失败：${payload?.reason || "平台未给出原因"}`);
    }

    onTick?.(status);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`[硅基流动] 任务 ${requestId} 超过 ${Math.round(timeoutMs / 60000)} 分钟仍未完成`);
}
