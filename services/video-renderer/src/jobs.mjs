/**
 * 生成任务表。
 *
 * 生视频是分钟级的异步活儿（数字人单段就要 5-10 分钟），HTTP 请求扛不住等待，
 * 所以建任务立刻返回 id，前端轮询进度。存在内存里：任务本来就绑着本机的 out/ 文件，
 * 服务重启后文件还在但任务上下文没了，硬盘持久化在这个场景里收益很小。
 */

import { normalizeError } from "./errors.mjs";

const jobs = new Map();

/** 超过这个时间的完成态任务会被清掉，避免长期跑着的服务把内存越占越多。 */
const RETAIN_MS = 6 * 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.state !== "running" && now - job.updatedAt > RETAIN_MS) jobs.delete(id);
  }
}

export function createJob(kind) {
  prune();
  const id = `${kind}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  const job = {
    id,
    kind,
    state: "running",
    stage: "排队中",
    /** 已完成/总片段数，前端据此显示「第 2/4 段」 */
    step: 0,
    totalSteps: 1,
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

/** 统一的失败收尾：日志留上下文，任务状态带上用户能看懂的原因。 */
export function failJob(id, error, context) {
  const message = normalizeError(error);
  console.error("[video-gen] 任务失败", { userId: "local", tenantId: "local", action: "video.generate", jobId: id, ...context, message });
  return updateJob(id, { state: "error", stage: "失败", error: message });
}
