import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { apiOk } from "@/app/api/feishu/_utils";
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

export async function GET() {
  const [codexVersion, codexLogin, codexModel, geminiVersion, grokVersion, grokLogin] = await Promise.all([
    commandOutput("codex", ["--version"]),
    commandOutput("codex", ["login", "status"]),
    readCodexDefaultModel(),
    commandOutput("gemini", ["--version"]),
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
    {
      id: "gemini",
      name: "Google · Gemini",
      available: Boolean(geminiVersion),
      authenticated: false,
      version: geminiVersion || undefined,
      message: geminiVersion
        ? "个人订阅登录被 Gemini CLI 拒绝，官方要求迁移到 Antigravity"
        : "未安装 Gemini CLI",
      models: [],
    },
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
