import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { apiOk } from "@/app/api/feishu/_utils";
import type { CliProviderStatus } from "@/lib/imageFactory";

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

export async function GET() {
  const [codexVersion, codexLogin, geminiVersion, grokVersion, grokLogin] = await Promise.all([
    commandOutput("codex", ["--version"]),
    commandOutput("codex", ["login", "status"]),
    commandOutput("gemini", ["--version"]),
    commandOutput("grok", ["--version"]),
    commandOutput("grok", ["--no-auto-update", "models"]),
  ]);

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
    },
  ];

  return apiOk({ providers }, "CLI 状态检查完成");
}
