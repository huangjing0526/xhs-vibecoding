/**
 * 阿里云百炼（DashScope）适配：数字人口播 wan2.2-s2v。
 *
 * 三个必须遵守的平台约束，实现细节都是围着它们转的：
 * 1. 图片和音频只能给 URL，本机文件进不去 —— 所以先传百炼的「临时存储空间」拿 oss:// 地址；
 * 2. 单次音频 < 20 秒 —— 长口播必须切段，切段逻辑在 script.mjs；
 * 3. 同一账号同时只跑 1 个任务 —— 所以段与段之间是串行的，见 avatarPipeline.mjs。
 *
 * 文档：https://www.alibabacloud.com/help/en/model-studio/wan-s2v-api
 *      https://help.aliyun.com/zh/model-studio/get-temporary-file-url
 */

import { readFile } from "node:fs/promises";
import { readApiError } from "./http.mjs";

const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/api/v1";
export const S2V_MODEL = "wan2.2-s2v";

/** 单次任务的音频硬上限（秒）。平台限 20，留出余量给 TTS 时长估算误差。 */
export const S2V_MAX_AUDIO_SEC = 19;

/** 单价（元/秒），用于生成前的费用预估。来源：百炼计费文档。 */
export const S2V_PRICE_PER_SEC = { "480P": 0.5, "720P": 0.9 };

/** 图生视频默认走 flash 档：0.1 元/秒，是同平台 plus 档和硅基流动的几分之一。 */
export const I2V_MODEL = "wan2.2-i2v-flash";

function requireApiKey() {
  const key = process.env.DASHSCOPE_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "未配置 DASHSCOPE_API_KEY。数字人口播走阿里云百炼 wan2.2-s2v，请在 services/video-renderer/.env 里配置华北2（北京）地域的 API Key。"
    );
  }
  return key;
}

/** 开跑前先确认 key 在。否则用户要白等一整轮配音，才在上传那步看到「没配 key」。 */
export function assertConfigured() {
  requireApiKey();
}

/**
 * 把本机文件传到百炼临时存储空间，返回 oss:// 地址（48 小时有效）。
 *
 * 注意 model 必须与后续调用的模型一致，这是平台规定的绑定关系，传错了取用时会 404。
 */
export async function uploadToTemporaryStorage({ filePath, fileName, model = S2V_MODEL }) {
  const apiKey = requireApiKey();

  const policyResponse = await fetch(
    `${DASHSCOPE_BASE}/uploads?action=getPolicy&model=${encodeURIComponent(model)}`,
    { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } }
  );
  if (!policyResponse.ok) throw await readApiError(policyResponse, { vendor: "百炼", action: "获取上传凭证" });

  const { data } = await policyResponse.json();
  if (!data?.upload_host || !data?.upload_dir) {
    throw new Error("[百炼] 上传凭证响应缺少 upload_host / upload_dir，无法上传素材");
  }

  const key = `${data.upload_dir}/${fileName}`;
  const form = new FormData();
  form.append("OSSAccessKeyId", data.oss_access_key_id);
  form.append("Signature", data.signature);
  form.append("policy", data.policy);
  form.append("key", key);
  form.append("x-oss-object-acl", data.x_oss_object_acl ?? "private");
  form.append("x-oss-forbid-overwrite", data.x_oss_forbid_overwrite ?? "true");
  form.append("success_action_status", "200");
  form.append("file", new Blob([await readFile(filePath)]), fileName);

  const uploadResponse = await fetch(data.upload_host, { method: "POST", body: form });
  if (!uploadResponse.ok) throw await readApiError(uploadResponse, { vendor: "百炼", action: "上传素材到临时存储" });

  return `oss://${key}`;
}

/**
 * 创建数字人口播任务，返回 task_id。
 *
 * 没有先调 wan2.2-s2v-detect 做人像合规预检：那个接口的请求形态没有可靠文档，
 * 而 s2v 本身对不合规人像会直接返回带原因的错误，信息量一样够。等实测拿到
 * detect 的准确契约再补，比现在凭猜写一个调用要好。
 */
export async function createAvatarTask({ imageUrl, audioUrl, resolution = "480P" }) {
  const apiKey = requireApiKey();

  const response = await fetch(`${DASHSCOPE_BASE}/services/aigc/image2video/video-synthesis`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
      // 传 oss:// 地址时必须开，否则平台按普通 URL 解析会取不到文件
      "X-DashScope-OssResourceResolve": "enable",
    },
    body: JSON.stringify({
      model: S2V_MODEL,
      input: { image_url: imageUrl, audio_url: audioUrl },
      parameters: { resolution },
    }),
  });

  if (!response.ok) throw await readApiError(response, { vendor: "百炼", action: "创建数字人任务" });

  const payload = await response.json();
  const taskId = payload?.output?.task_id;
  if (!taskId) {
    throw new Error(`[百炼] 创建任务成功但没拿到 task_id：${JSON.stringify(payload).slice(0, 400)}`);
  }
  return taskId;
}

/**
 * 图生视频建任务，返回 task_id。
 *
 * 与数字人的差别：图片可以直接给 base64 data URL，不用先传临时存储空间，少一次往返。
 * 端点也不是同一个（数字人在 image2video，图生视频在 video-generation）。
 */
export async function createImageToVideoTask({
  image,
  prompt,
  model = I2V_MODEL,
  resolution = "720P",
  duration = 5,
}) {
  const apiKey = requireApiKey();

  const response = await fetch(`${DASHSCOPE_BASE}/services/aigc/video-generation/video-synthesis`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model,
      input: { prompt, img_url: image },
      parameters: { resolution, duration },
    }),
  });

  if (!response.ok) throw await readApiError(response, { vendor: "百炼", action: "创建图生视频任务" });

  const payload = await response.json();
  const taskId = payload?.output?.task_id;
  if (!taskId) {
    throw new Error(`[百炼] 创建任务成功但没拿到 task_id：${JSON.stringify(payload).slice(0, 400)}`);
  }
  return taskId;
}

/**
 * 轮询任务直到出结果。数字人和图生视频用的是同一个任务查询接口，所以共用这一个。
 * 单任务通常 5-10 分钟，默认给到 20 分钟上限。
 * @param onTick 每次轮询回调当前状态，供上层刷新进度文案
 */
export async function waitForTask({ taskId, onTick, intervalMs = 8000, timeoutMs = 20 * 60 * 1000 }) {
  const apiKey = requireApiKey();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`${DASHSCOPE_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw await readApiError(response, { vendor: "百炼", action: "查询任务状态" });

    const payload = await response.json();
    const output = payload?.output || {};
    const status = output.task_status;

    if (status === "SUCCEEDED") {
      // 数字人把地址放在 results 里，图生视频直接挂在 output 上，两种都认
      const videoUrl = output.results?.video_url || output.video_url;
      if (!videoUrl) throw new Error("[百炼] 任务成功但结果里没有 video_url");
      return { videoUrl, durationSec: Number(payload?.usage?.duration) || 0 };
    }
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      throw new Error(
        `[百炼] 任务${status === "FAILED" ? "失败" : "未完成"}：${output.message || output.code || status}`
      );
    }

    onTick?.(status);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`[百炼] 任务 ${taskId} 超过 ${Math.round(timeoutMs / 60000)} 分钟仍未完成，已放弃等待`);
}
