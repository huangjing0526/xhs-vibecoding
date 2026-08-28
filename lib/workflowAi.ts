import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

type WorkflowAIProvider = "openai" | "anthropic" | "siliconflow" | "gemini" | "custom" | "codex-cli" | "mock";

interface WorkflowAIConfig {
  provider: WorkflowAIProvider;
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

/** 随 prompt 一起送去看的图。只走内存不落盘，调用方自己决定压到多大。 */
export interface WorkflowImage {
  /** 收窄到各家都认的这几种，省掉调用处的类型断言 */
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
}

interface GenerateJsonOptions<T> {
  action: string;
  prompt: string;
  fallback: T;
  maxTokens?: number;
  /** 强制指定 provider（如道库判断强制走 anthropic），不传则按 env 自动探测 */
  forceProvider?: WorkflowAIProvider;
  /** 要模型看图时传，provider 不支持视觉的话由调用方自己承担 */
  images?: WorkflowImage[];
}

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function detectWorkflowAIConfig(): WorkflowAIConfig {
  // 显式指定优先于按 key 探测：codex 走本机 CLI，没有 key 可探，
  // 而且配了 GEMINI_API_KEY 的机器上也可能是想用 codex（比如那家配额用完了）
  if (getEnv("WORKFLOW_AI_PROVIDER") === "codex-cli") {
    return { provider: "codex-cli", model: getEnv("CODEX_MODEL") };
  }
  if (getEnv("GEMINI_API_KEY")) {
    return {
      provider: "gemini",
      apiKey: getEnv("GEMINI_API_KEY"),
      model: getEnv("GEMINI_MODEL") || "gemini-2.5-flash",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    };
  }
  if (getEnv("SILICONFLOW_API_KEY")) {
    return {
      provider: "siliconflow",
      apiKey: getEnv("SILICONFLOW_API_KEY"),
      model: getEnv("SILICONFLOW_MODEL") || "Qwen/Qwen2.5-7B-Instruct",
      baseURL: "https://api.siliconflow.cn/v1",
    };
  }
  if (getEnv("OPENAI_API_KEY")) {
    return {
      provider: "openai",
      apiKey: getEnv("OPENAI_API_KEY"),
      model: getEnv("OPENAI_MODEL") || "gpt-4o-mini",
    };
  }
  if (getEnv("ANTHROPIC_API_KEY")) {
    return {
      provider: "anthropic",
      apiKey: getEnv("ANTHROPIC_API_KEY"),
      model: getEnv("ANTHROPIC_MODEL") || "claude-sonnet-4-5-20251001",
    };
  }
  if (getEnv("CUSTOM_API_KEY") && getEnv("CUSTOM_API_BASE")) {
    return {
      provider: "custom",
      apiKey: getEnv("CUSTOM_API_KEY"),
      model: getEnv("CUSTOM_MODEL") || "gpt-3.5-turbo",
      baseURL: getEnv("CUSTOM_API_BASE"),
    };
  }
  return { provider: "mock" };
}

function extractJson(text: string): unknown {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = codeBlockMatch?.[1] || text;
  const objectStart = candidate.indexOf("{");
  const arrayStart = candidate.indexOf("[");

  let start = -1;
  if (objectStart === -1) start = arrayStart;
  else if (arrayStart === -1) start = objectStart;
  else start = Math.min(objectStart, arrayStart);

  if (start < 0) {
    throw new Error("模型未返回 JSON");
  }

  const sliced = candidate.slice(start).trim();
  const endChar = sliced[0] === "[" ? "]" : "}";
  const end = sliced.lastIndexOf(endChar);
  if (end < 0) {
    throw new Error("模型返回 JSON 不完整");
  }

  const body = sliced.slice(0, end + 1);
  try {
    return JSON.parse(body);
  } catch (error) {
    // 尾逗号是模型最常见的一种坏 JSON，修掉再试一次；还是不行就照实抛
    const repaired = body.replace(/,(\s*[}\]])/g, "$1");
    if (repaired === body) throw error;
    return JSON.parse(repaired);
  }
}

/** 坏 JSON 是模型这一轮抽风，重来一轮通常就好了；网络类错误由 runWithRetry 管。 */
function isMalformedJsonError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    error instanceof SyntaxError ||
    message.includes("模型未返回 JSON") ||
    message.includes("模型返回 JSON 不完整")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/**
 * 配额耗尽和短时超速都是 429，但重试的意义完全相反。
 *
 * 超速等一会儿就好；配额耗尽等到明天才好，这时重试三次只是把剩下的额度也烧掉——
 * 实测免费层每天 20 次请求，一次失败重试三遍就吃掉 15% 的当日额度，而且必然全失败。
 * 状态码分不出这两种，只能看错误正文。
 */
function isQuotaExhausted(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /quota|exceeded your current|billing/i.test(message);
}

function shouldRetryWorkflowAI(error: unknown): boolean {
  if (isQuotaExhausted(error)) return false;
  const status = getErrorStatus(error);
  return !status || status === 429 || status >= 500;
}

async function runWithRetry<T>(action: string, provider: WorkflowAIProvider, task: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetryWorkflowAI(error)) break;

      console.warn("[WorkflowAI] 临时失败，准备重试", {
        userId: "local",
        tenantId: "feishu",
        action,
        provider,
        attempt,
        status: getErrorStatus(error),
      });
      await sleep(attempt * 1200);
    }
  }

  throw lastError;
}

/** 跑一条本机命令，把 stdout 收回来。prompt 走 stdin，避免超长命令行。 */
function runCli(command: string, args: string[], stdin: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} 执行超时`));
    }, timeoutMs);
    child.stdin.end(stdin);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(new Error(`跑不起来 ${command}：${error.message}`)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} 失败（退出码 ${code}）：${(stderr || stdout).slice(-400)}`));
    });
  });
}

/** codex CLI 一次调用的默认上限。十几张图它要跑好几分钟，卡死了也得有个头。 */
const CODEX_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * 走本机的 codex CLI 看图。
 *
 * 为什么值得单开一条通道：它用的是本机已登录的额度，不吃这个项目的 API key，
 * 所以某一家配额用完时还有路可走。图片要落成文件（-i 只认路径），
 * 提示词走 stdin（十几张图的提示词几千字，塞命令行参数不合适）。
 */
async function runCodexCli(prompt: string, images: WorkflowImage[] | undefined, model?: string): Promise<string> {
  const work = await mkdtemp(path.join(tmpdir(), "codex-vision-"));
  try {
    const args = ["exec"];
    for (const [index, image] of (images || []).entries()) {
      const ext = image.mimeType === "image/png" ? "png" : image.mimeType === "image/webp" ? "webp" : "jpg";
      const file = path.join(work, `img-${String(index + 1).padStart(2, "0")}.${ext}`);
      await writeFile(file, Buffer.from(image.base64, "base64"));
      args.push("-i", file);
    }
    if (model) args.push("-c", `model=${JSON.stringify(model)}`);
    const outFile = path.join(work, "answer.txt");
    // -o 只写最后一条消息，省得从整段运行日志里捞回答
    args.push("-o", outFile, "-");
    await runCli("codex", args, prompt, CODEX_TIMEOUT_MS);
    return await readFile(outFile, "utf8");
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export async function generateWorkflowJson<T>({
  action,
  prompt,
  fallback,
  maxTokens = 3000,
  forceProvider,
  images,
}: GenerateJsonOptions<T>): Promise<{ result: T; usedFallback: boolean; provider: WorkflowAIProvider }> {
  let config = detectWorkflowAIConfig();

  // 强制 provider（如道库判断强制走 Claude）：该 provider 的 key 没配则退回 mock（不静默降级到别家）
  if (forceProvider && forceProvider !== config.provider) {
    if (forceProvider === "anthropic" && getEnv("ANTHROPIC_API_KEY")) {
      config = {
        provider: "anthropic",
        apiKey: getEnv("ANTHROPIC_API_KEY"),
        model: getEnv("ANTHROPIC_MODEL") || "claude-sonnet-4-5-20251001",
      };
    } else if (forceProvider === "mock") {
      config = { provider: "mock" };
    } else {
      // 想强制某家但没配 key → 不降级到别家，直接 mock，由调用方决定怎么处理
      config = { provider: "mock" };
    }
  }

  if (config.provider === "mock") {
    return { result: fallback, usedFallback: true, provider: "mock" };
  }

  /** 一次完整尝试：调模型 + 解析。解析失败要连模型调用一起重来，光重解析没意义。 */
  const attemptOnce = async (): Promise<T> => {
    let rawText = "";

    if (config.provider === "codex-cli") {
      rawText = await runWithRetry(action, config.provider, () =>
        runCodexCli(prompt, images, config.model),
      );
    } else if (config.provider === "anthropic") {
      const message = await runWithRetry(action, config.provider, async () => {
        const anthropic = new Anthropic({ apiKey: config.apiKey });
        // 图放在文字前面：模型先看完素材再读要求，比反过来准
        const content: Anthropic.MessageParam["content"] = images?.length
          ? [
              ...images.map((image) => ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: image.mimeType, data: image.base64 },
              })),
              { type: "text" as const, text: prompt },
            ]
          : prompt;
        return anthropic.messages.create({
          model: config.model || "claude-sonnet-4-5-20251001",
          max_tokens: maxTokens,
          messages: [{ role: "user", content }],
        });
      });
      rawText = message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
    } else {
      const completion = await runWithRetry(action, config.provider, async () => {
        const openai = new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL,
        });
        // gemini / siliconflow / openai 都吃 OpenAI 的多模态消息格式，走同一条分支
        const content: OpenAI.Chat.ChatCompletionContentPart[] | string = images?.length
          ? [
              ...images.map((image) => ({
                type: "image_url" as const,
                image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
              })),
              { type: "text" as const, text: prompt },
            ]
          : prompt;
        return openai.chat.completions.create({
          model: config.model || "gpt-4o-mini",
          messages: [{ role: "user", content }],
          temperature: 0.7,
        });
      });
      rawText = completion.choices[0]?.message?.content || "";
    }

    return extractJson(rawText) as T;
  };

  try {
    let result: T;
    try {
      result = await attemptOnce();
    } catch (error) {
      if (!isMalformedJsonError(error)) throw error;
      console.warn("[WorkflowAI] 模型返回的 JSON 解析不了，整轮重来一次", {
        userId: "local",
        tenantId: "feishu",
        action,
        provider: config.provider,
        message: error instanceof Error ? error.message : String(error),
      });
      result = await attemptOnce();
    }

    return { result, usedFallback: false, provider: config.provider };
  } catch (error) {
    console.error("[WorkflowAI] 生成失败", {
      userId: "local",
      tenantId: "feishu",
      action,
      provider: config.provider,
      error,
    });
    throw new Error(error instanceof Error ? error.message : "AI 生成失败");
  }
}
