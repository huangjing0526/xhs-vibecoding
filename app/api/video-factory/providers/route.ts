import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { apiOk } from "@/app/api/feishu/_utils";
import type { VideoGenProviderStatus } from "@/lib/videoFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const GROK_AUTH_PATH = path.join(homedir(), ".grok", "auth.json");

async function commandOutput(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { encoding: "utf8" });
    return `${stdout}\n${stderr}`.trim();
  } catch {
    return null;
  }
}

interface GrokAuthState {
  /** 本机存着一份 OAuth 凭据，凭据过期时 CLI 自己会拿 refresh token 续 */
  hasCredentials: boolean;
  /** 账号侧「coding data 不保留」的开关；读不出来时为 null */
  optOut: boolean | null;
}

/**
 * grok 的图生视频会被账号侧的「coding data 不保留」挡掉：
 * 服务端把这种账号当 ZDR，要求调用方自带 output.upload_url，而 CLI 的工具压根没有这个参数。
 * 这个开关只在 CLI 的 /privacy 弹窗里，探测它才能在生成前就把话说清楚，而不是让用户白等一次 400。
 */
async function readGrokAuthState(): Promise<GrokAuthState> {
  try {
    const parsed = JSON.parse(await readFile(GROK_AUTH_PATH, "utf8")) as Record<string, unknown>;
    for (const entry of Object.values(parsed)) {
      if (entry && typeof entry === "object" && "coding_data_retention_opt_out" in entry) {
        return {
          hasCredentials: true,
          optOut: Boolean((entry as { coding_data_retention_opt_out?: unknown }).coding_data_retention_opt_out),
        };
      }
    }
    return { hasCredentials: false, optOut: null };
  } catch (error) {
    // 没装 / 没登录时文件不存在是正常的，其余情况留痕后按「测不出来」处理
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[VideoFactory] grok 登录态读取失败", {
        userId: "local",
        action: "videoFactory.providers.grokAuth",
        error,
      });
    }
    return { hasCredentials: false, optOut: null };
  }
}

function describeGrok(version: string | null, loggedIn: boolean, optOut: boolean | null): string {
  if (!version) return "未安装 Grok CLI";
  if (!loggedIn) return "需要运行 grok login --oauth";
  if (optOut === true) {
    return "已登录，但视频生成被 coding data 的 Opt out 挡住：在 grok 里跑 /privacy 切成 Opt in";
  }
  return "已登录，可用 image_to_video 出片（每镜 6/10 秒，480p/720p）";
}

export async function GET() {
  const [grokVersion, grokModels, auth] = await Promise.all([
    commandOutput("grok", ["--version"]),
    commandOutput("grok", ["--no-auto-update", "models"]),
    readGrokAuthState(),
  ]);

  // models 探测要联网，token 刷新那几秒会失败；本机有凭据就别急着说人家没登录，
  // 否则卡片会无缘无故翻成「需要 grok login」，用户以为掉登录了
  const loggedIn = Boolean(grokModels?.includes("logged in with grok.com")) || auth.hasCredentials;
  const optOut = auth.optOut;

  const providers: VideoGenProviderStatus[] = [
    {
      id: "grok-cli",
      name: "xAI · Grok CLI",
      available: Boolean(grokVersion),
      // opt-out 没关掉就等于用不了，直接算作未就绪，省得点下去才报 400
      authenticated: loggedIn && optOut !== true,
      version: grokVersion || undefined,
      message: describeGrok(grokVersion, loggedIn, optOut),
    },
    {
      id: "doubao",
      name: "豆包（网页端 + 下载器）",
      // 扩展装没装是浏览器里的事，服务端探测不到，只能常驻可用并把用法写在 message 里
      available: true,
      authenticated: true,
      message: "在豆包网页端生成，用「豆包下载器」扩展的『送到工作台』直接挂到镜头上",
    },
    {
      id: "manual",
      name: "手动生成（即梦 / 可灵）",
      available: true,
      authenticated: true,
      message: "复制每镜的提示词和首帧图去平台生成，再把 mp4 传回来挂到镜头上",
    },
  ];

  return apiOk({ providers }, "生成引擎状态检查完成");
}
