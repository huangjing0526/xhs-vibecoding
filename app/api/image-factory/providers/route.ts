import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { apiOk } from "@/app/api/feishu/_utils";
import { readGeminiKey } from "@/lib/engines/gemini";
import { listGeminiModels } from "@/lib/engines/gemini/models";
import { readQuotaState } from "@/lib/engines/gemini/quota";
import type { CliProviderStatus, ImageCliModel } from "@/lib/imageFactory";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

async function commandOutput(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { encoding: "utf8" });
    return `${stdout}\n${stderr}`.trim();
  } catch {
    return null;
  }
}

/**
 * 从 `grok models` 的输出里挑出可选模型。
 * 输出形如「Available models:」后面跟若干「  * grok-4.6 (default)」「  - grok-4.5」，
 * 带 (default) 的那条就是不指定模型时用的。
 */
function parseGrokModels(output: string | null): { models: ImageCliModel[]; defaultModel?: string } {
  if (!output) return { models: [] };

  const models: ImageCliModel[] = [];
  let defaultModel: string | undefined;
  for (const line of output.split("\n")) {
    const matched = line.match(/^\s*[*-]\s+([A-Za-z0-9._:\/-]+)\s*(\(default\))?/);
    if (!matched) continue;
    models.push({ id: matched[1], label: matched[1] });
    if (matched[2]) defaultModel = matched[1];
  }
  return { models, defaultModel };
}

/**
 * Codex 没有列模型的子命令，只能读配置里那条。
 * 探不到就返回空列表，前端仍可手填模型名——宁可少给选项，也不猜一个会让生成直接失败的 id。
 */
async function readCodexDefaultModel(): Promise<string | undefined> {
  try {
    const config = await readFile(path.join(homedir(), ".codex", "config.toml"), "utf8");
    // 只认顶层那条 model =，profile 段里的同名键跟着各自的 profile 走，这里不掺和
    const matched = config.split(/\n\s*\[/, 1)[0].match(/^\s*model\s*=\s*"([^"]+)"/m);
    return matched?.[1];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[ImageFactory] Codex 配置读取失败", { userId: "local", action: "imageFactory.providers.codexModel", error });
    }
    return undefined;
  }
}

/**
 * Gemini 探的是 API key，不是 CLI。
 *
 * 本机装没装 `gemini` 二进制在这里已经不重要了——个人 Google 账号登录 CLI 会被
 * Code Assist 以 UNSUPPORTED_CLIENT 拒掉（实测仍然如此），但 AI Studio 的 API key
 * 不走那条路，是通的。所以这张卡片只关心：key 在不在、拉不拉得到模型、今天的额度还剩没剩。
 */
async function detectGemini(): Promise<CliProviderStatus> {
  const base = {
    id: "gemini" as const,
    name: "Google · Gemini",
    available: false,
    authenticated: false,
    models: [] as ImageCliModel[],
  };

  if (!readGeminiKey()) {
    return { ...base, message: "未配置 GEMINI_API_KEY，在 .env.local 里填上即可启用" };
  }

  try {
    const [catalog, quota] = await Promise.all([listGeminiModels(), readQuotaState()]);
    const models = catalog.image.map((item) => ({ id: item.id, label: item.label }));
    const defaultModel = models[0]?.id;

    // 额度用完时仍然算「已认证」：key 是好的、模型也在，只是今天跑不了，
    // 翻成「未登录」会把人引去查 key，查了也查不出问题
    return {
      ...base,
      available: true,
      authenticated: true,
      message: quota ? quota.message : `API key 可用，探到 ${models.length} 个图像模型`,
      models,
      defaultModel,
    };
  } catch (error) {
    console.error("[ImageFactory] Gemini 探测失败", {
      userId: "local",
      action: "imageFactory.providers.gemini",
      error,
    });
    const message = error instanceof Error ? error.message : "探测失败";
    return { ...base, available: true, message: `Gemini 探测失败：${message}` };
  }
}

export async function GET() {
  const [codexVersion, codexLogin, codexModel, gemini, grokVersion, grokLogin] = await Promise.all([
    commandOutput("codex", ["--version"]),
    commandOutput("codex", ["login", "status"]),
    readCodexDefaultModel(),
    detectGemini(),
    commandOutput("grok", ["--version"]),
    commandOutput("grok", ["--no-auto-update", "models"]),
  ]);

  const grokModels = parseGrokModels(grokLogin);

  const providers: CliProviderStatus[] = [
    {
      id: "codex",
      name: "OpenAI · Codex",
      available: Boolean(codexVersion),
      authenticated: Boolean(codexLogin?.includes("Logged in using ChatGPT")),
      version: codexVersion || undefined,
      message: codexLogin?.includes("Logged in using ChatGPT")
        ? "已使用 ChatGPT 订阅登录"
        : codexVersion
          ? "需要运行 codex login 并使用 ChatGPT 登录"
          : "未安装 Codex CLI",
      models: codexModel ? [{ id: codexModel, label: codexModel }] : [],
      defaultModel: codexModel,
    },
    gemini,
    {
      id: "grok",
      name: "xAI · Grok",
      available: Boolean(grokVersion),
      authenticated: Boolean(grokLogin?.includes("logged in with grok.com")),
      version: grokVersion || undefined,
      message: grokLogin?.includes("logged in with grok.com")
        ? "已安装并完成 OAuth 登录"
        : grokVersion
          ? "需要运行 grok login --oauth"
          : "未安装 Grok CLI",
      models: grokModels.models,
      defaultModel: grokModels.defaultModel,
    },
  ];

  return apiOk({ providers }, "CLI 状态检查完成");
}
