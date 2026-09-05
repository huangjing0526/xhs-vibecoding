import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { apiOk } from "@/app/api/feishu/_utils";
import { probeGeminiEngine } from "@/lib/engines/gemini/probe";
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

/**
 * Veo 探的是 API key，跟本机装没装 gemini CLI 无关——
 * 个人账号登录 CLI 会被 Code Assist 拒掉，但 AI Studio 的 key 走的是另一条路，是通的。
 *
 * 但「key 有效」不等于「跑得了」：Veo 三个变体在免费层全是 Not available，只有 API 付费层能用。
 * 这一点探测探不出来（要真发一次合法请求才知道，而那一次就已经计费了），
 * 所以写死在文案里说清楚——否则卡片显示「API key 可用」，人点下去才吃一个拒绝。
 *
 * 注意跟 Flow（labs.google/flow）的积分不是一回事：那是 Google AI Pro/Ultra 订阅的额度，
 * 只有网页端能用、没有 API 出口。有订阅想省钱的话走下面 manual 那条回传通道。
 */
async function detectVeo(): Promise<VideoGenProviderStatus> {
  const probe = await probeGeminiEngine("video");
  const base = { id: "gemini-veo" as const, name: "Google · Veo 3.1" };

  if (!probe.hasKey) {
    return { ...base, available: false, authenticated: false, message: "未配置 GEMINI_API_KEY，在 .env.local 里填上即可启用" };
  }
  if (probe.error) {
    return { ...base, available: true, authenticated: false, message: `Veo 探测失败：${probe.error}` };
  }
  if (!probe.models.length) {
    return { ...base, available: true, authenticated: false, message: "这个 key 下没有可用的 Veo 模型" };
  }

  return {
    ...base,
    available: true,
    // 同图片侧：额度用完不算「未认证」，key 是好的，只是今天跑不了
    authenticated: true,
    message:
      probe.quotaMessage ||
      `${probe.models.length} 个模型（每镜 4/6/8 秒，720p/1080p）· 需 API 付费层，免费层不支持 Veo`,
    models: probe.models.map((item) => ({ id: item.id, label: item.label })),
    defaultModel: probe.defaultModel,
  };
}

export async function GET() {
  const [grokVersion, grokModels, auth, veo] = await Promise.all([
    commandOutput("grok", ["--version"]),
    commandOutput("grok", ["--no-auto-update", "models"]),
    readGrokAuthState(),
    detectVeo(),
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
    veo,
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
      message: "复制每镜的提示词和首帧图去 Flow / 即梦 / 可灵生成，再把 mp4 传回来挂到镜头上",
    },
  ];

  return apiOk({ providers }, "生成引擎状态检查完成");
}
