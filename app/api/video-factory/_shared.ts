import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { JOB_ROOT, isSafeSegment, newShortId } from "@/app/api/image-factory/_shared";
import { EMPTY_CAST, type VideoProject } from "@/lib/videoFactory";

// 路径安全校验与短 id 的规则两个工厂完全一致，直接复用图片工厂那份，不再造第二套
export { isSafeSegment };

/** 视频工厂的本机存储布局：项目 JSON 与各镜产物都挂在这一个根下。 */
export const FACTORY_ROOT = path.join(process.cwd(), ".local", "video-factory");
export const PROJECT_ROOT = path.join(FACTORY_ROOT, "projects");

/** 图片工厂的产物目录，视频工厂从这里挑第一帧图，不重复造一套图库。 */
export const IMAGE_JOB_ROOT = JOB_ROOT;

/** 项目 id：时间前缀便于人肉排序，随机后缀避免同毫秒撞车。 */
export const newProjectId = newShortId;

/**
 * 跑一个本机命令，把 stdout 和 stderr 一起返回。
 * ffmpeg 的检测结果全走 stderr，正常结束也要读，所以两条流都得收。
 */
export function runCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; timeoutMs?: number; timeoutMessage?: string; stdin?: string },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: process.env,
      // 有些 CLI（codex exec -）只从 stdin 收提示词，要喂就得开这条管
      stdio: [options?.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    if (options?.stdin !== undefined) child.stdin?.end(options.stdin);
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(options?.timeoutMessage || `${command} 执行超时`));
    }, timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`跑不起来 ${command}：${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(`${stdout}\n${stderr}`);
      else reject(new Error(`${command} 失败（退出码 ${code}）：${(stderr || stdout).slice(-400)}`));
    });
  });
}

/** 拆过的对标节奏：是跨项目复用的模板，所以不挂在某个项目下面。 */
export const BENCHMARK_ROOT = path.join(FACTORY_ROOT, "benchmarks");

export function benchmarkDir(benchmarkId: string): string {
  return path.join(BENCHMARK_ROOT, benchmarkId);
}

export function projectDir(projectId: string): string {
  return path.join(PROJECT_ROOT, projectId);
}

export function projectFile(projectId: string): string {
  return path.join(projectDir(projectId), "project.json");
}

/** 某一镜的成片路径。同一镜重跑直接覆盖——留着旧的只会让人分不清哪个是最新的。 */
export function clipPath(projectId: string, shotOrder: number): string {
  return path.join(projectDir(projectId), `shot-${String(shotOrder).padStart(2, "0")}.mp4`);
}

/** 项目绑定的角色/产品参考图落点。 */
export function castPath(projectId: string, slot: string, extension: string): string {
  return path.join(projectDir(projectId), `cast-${slot}${extension}`);
}

/** 某一镜的首帧图落点，扩展名跟上传的走。 */
export function framePath(projectId: string, shotOrder: number, extension: string): string {
  return path.join(projectDir(projectId), `frame-${String(shotOrder).padStart(2, "0")}${extension}`);
}

export async function readProject(projectId: string): Promise<VideoProject | null> {
  try {
    const parsed = JSON.parse(await readFile(projectFile(projectId), "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    // 加 genProvider 之前存的项目没有这个字段，读出来就地补上：
    // 界面拿它去查引擎能力表（时长档位、分辨率），拿到 undefined 会直接崩在渲染里
    const project = { genProvider: "grok-cli", ...parsed } as VideoProject;
    // 同理，加场景槽位之前存的项目 cast 里只有角色和产品，缺的槽位补成未绑定
    return { ...project, cast: { ...EMPTY_CAST, ...project.cast } };
  } catch (error) {
    // 首次保存前文件不存在是正常的，其余情况要留痕再按空项目继续
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[VideoFactory] 项目读取失败", {
        userId: "local",
        action: "videoFactory.project.read",
        projectId,
        error,
      });
    }
    return null;
  }
}

export async function writeProject(project: VideoProject): Promise<VideoProject> {
  const next = { ...project, updatedAt: new Date().toISOString() };
  await mkdir(projectDir(project.id), { recursive: true });
  await writeFile(projectFile(project.id), JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** 项目列表，按更新时间倒序。读的是每个项目的 JSON，本机项目量级下够快。 */
export async function listProjects(): Promise<VideoProject[]> {
  let entries: string[];
  try {
    entries = (await readdir(PROJECT_ROOT, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && isSafeSegment(entry.name))
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[VideoFactory] 项目目录读取失败", {
        userId: "local",
        action: "videoFactory.project.list",
        error,
      });
    }
    return [];
  }

  const projects = await Promise.all(entries.map((id) => readProject(id)));
  return projects
    .filter((project): project is VideoProject => Boolean(project))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
