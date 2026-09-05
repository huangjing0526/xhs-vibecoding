import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { apiError, apiOk } from "@/app/api/feishu/_utils";
import { IMAGE_JOB_ROOT } from "@/app/api/video-factory/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
/** 只回最近这些张：首帧图是刚在图片工厂跑出来的，翻太久没意义 */
const MAX_FRAMES = 48;

export interface FrameCandidate {
  /** 图片工厂产物的绝对路径，生成时原样回传 */
  path: string;
  /** 「任务目录/视角」，用来在选择器里认出这是哪一次跑的哪个视角 */
  label: string;
  createdAt: string;
}

/** 递归收图片工厂的产物，跳过 inputs（那是参考图，不是产出）。 */
async function collect(root: string, depth = 0): Promise<FrameCandidate[]> {
  if (depth > 3) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return [];
  }

  const found: FrameCandidate[] = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "inputs") continue;
      found.push(...(await collect(target, depth + 1)));
    } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const info = await stat(target).catch(() => null);
      if (!info) continue;
      found.push({
        path: target,
        label: path.relative(IMAGE_JOB_ROOT, target).replace(/\\/g, "/"),
        createdAt: new Date(info.mtimeMs).toISOString(),
      });
    }
  }
  return found;
}

/** 列出图片工厂里可以当首帧用的图，最新的在前。 */
export async function GET() {
  try {
    const frames = (await collect(IMAGE_JOB_ROOT))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, MAX_FRAMES);
    return apiOk({ frames }, `图片工厂里有 ${frames.length} 张可用的首帧图`);
  } catch (error) {
    return apiError(error, "videoFactory.frames.list", "首帧图列表读取失败");
  }
}
