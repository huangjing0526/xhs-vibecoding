import { execFile } from "child_process";
import { stat } from "fs/promises";
import { promisify } from "util";
import { NextRequest } from "next/server";
import { apiError, apiOk, readJsonBody } from "../../feishu/_utils";

const execFileAsync = promisify(execFile);

interface PickDirectoryRequest {
  /** 弹窗默认定位到的目录（通常是输入框当前值）。 */
  defaultPath?: string;
}

/** 校验一个路径是不是存在的目录，供 AppleScript 的 default location 使用。 */
async function resolveExistingDir(candidate?: string): Promise<string | null> {
  const path = candidate?.trim();
  if (!path) return null;
  try {
    const info = await stat(path);
    return info.isDirectory() ? path : null;
  } catch {
    return null;
  }
}

/**
 * 弹出 macOS 原生「选择文件夹」对话框，返回真实绝对路径。
 * 仅在本地 macOS 环境可用——浏览器拿不到绝对路径，而后端要靠它读本地文件。
 */
export async function POST(request: NextRequest) {
  try {
    if (process.platform !== "darwin") {
      return apiOk({ path: null }, "选择目录仅支持 macOS 本地环境，请手动粘贴路径");
    }

    const body = await readJsonBody<PickDirectoryRequest>(request, "system.pickDirectory.readJson");
    const defaultDir = await resolveExistingDir(body.defaultPath);

    const locationClause = defaultDir ? ` default location (POSIX file ${JSON.stringify(defaultDir)})` : "";
    const script = `POSIX path of (choose folder with prompt "选择目录"${locationClause})`;

    try {
      const { stdout } = await execFileAsync("osascript", ["-e", script]);
      const picked = stdout.trim();
      if (!picked) return apiOk({ path: null }, "未选择目录");
      return apiOk({ path: picked }, "已选择目录");
    } catch (error) {
      // 用户点「取消」时 osascript 以 -128 退出，这不是错误，正常返回空。
      if (error instanceof Error && /User canceled|-128/.test(error.message)) {
        return apiOk({ path: null }, "已取消选择");
      }
      throw error;
    }
  } catch (error) {
    return apiError(error, "system.pickDirectory", "打开目录选择器失败");
  }
}
