import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { readAsset } from "@/app/api/image-factory/_assets";
import { JOB_ROOT, MIME_BY_EXTENSION, isSafeSegment, newShortId } from "@/app/api/image-factory/_shared";
import type { LibraryKind } from "@/lib/imageFactory";
import { EMPTY_CAST, clipFileName, upsertClip, type CastRef, type ShotClip, type VideoProject } from "@/lib/videoFactory";

// 路径安全校验与短 id 的规则两个工厂完全一致，直接复用图片工厂那份，不再造第二套
export { isSafeSegment };

/** 视频工厂的本机存储布局：项目 JSON 与各镜产物都挂在这一个根下。 */
export const FACTORY_ROOT = path.join(process.cwd(), ".local", "video-factory");
export const PROJECT_ROOT = path.join(FACTORY_ROOT, "projects");

/** 图片工厂的产物目录，视频工厂从这里挑第一帧图，不重复造一套图库。 */
export const IMAGE_JOB_ROOT = JOB_ROOT;

/**
 * 把素材库里的一张图拷进项目目录，连同它的特征与品类。三条绑定路由（项目级、对标实体、单镜）共用。
 * 拷而不是引用：库里那条以后改了、删了，这条片子不该跟着变。素材已不在库里时返回 null。
 */
export async function copyLibraryAsset(
  library: LibraryKind,
  assetId: string,
  targetFor: (extension: string) => string,
): Promise<{ target: string; facts: Pick<CastRef, "traits" | "category"> } | null> {
  const asset = await readAsset(library, assetId);
  if (!asset) return null;
  const target = targetFor(asset.extension);
  await writeFile(target, new Uint8Array(asset.bytes));
  return { target, facts: { traits: asset.record.traits, category: asset.record.category } };
}

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

/**
 * 本机拆片/渲染服务。拆片、配音都挂在它下面，
 * 几个路由各写一份 fallback 链必然漂移，收在这里。
 */
export const RENDERER_URL =
  process.env.VIDEO_EXTRACTOR_URL || process.env.VIDEO_RENDERER_URL || "http://localhost:8787";

/** 拆过的对标节奏：是跨项目复用的模板，所以不挂在某个项目下面。 */
export const BENCHMARK_ROOT = path.join(FACTORY_ROOT, "benchmarks");

/**
 * 人脸模型（YuNet）放这儿，逐镜量结构时用。
 *
 * 不进 git：二进制几十兆，且只有本机拆片这条线用得上。
 * 没装就没装，量化脚本会把相关指标标成 no-model 而不是崩掉。
 * 装法见 scripts/video-factory/fetch-models.sh。
 */
export const FACE_MODELS_DIR = path.join(FACTORY_ROOT, "models");

export function benchmarkDir(benchmarkId: string): string {
  return path.join(BENCHMARK_ROOT, benchmarkId);
}

/**
 * 限并发跑一批异步活儿，结果按输入顺序回。
 *
 * 用在成批 spawn ffmpeg 的地方：串着跑白等，一次全放又会让几十个进程抢同一个源文件。
 */
export async function mapLimited<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** 对标原片。目录布局的真相收在这一处，别在各个路由里各拼各的。 */
export function benchmarkSourcePath(benchmarkId: string): string {
  return path.join(benchmarkDir(benchmarkId), "source.mp4");
}

/**
 * 对标某一镜切出来的原片段，送进视频编辑模型换主体用的。
 * 和缩略图、大帧同放在节奏模板目录下——它们描述的是同一条片子的同一镜，分开放迟早对不上。
 */
export function benchmarkClipPath(benchmarkId: string, shotOrder: number): string {
  return path.join(benchmarkDir(benchmarkId), clipFileName(shotOrder));
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

/**
 * 对标实体绑定的素材落点，如 cast-entity-product-2.png。
 * slug 用 ASCII（role/product/scene + 序号），中文 token 不进文件名。
 */
export function castEntityPath(projectId: string, slug: string, extension: string): string {
  return path.join(projectDir(projectId), `cast-entity-${slug}${extension}`);
}

/** 某一镜单独指定的素材落点。和项目级 cast 并存，互不覆盖。 */
export function shotMaterialPath(projectId: string, shotOrder: number, extension: string): string {
  return path.join(projectDir(projectId), `shot-${String(shotOrder).padStart(2, "0")}-material${extension}`);
}

/**
 * 某一镜某一刀配音的落点。重配覆盖同名文件，不留旧的。
 *
 * 第 0 刀沿用不带刀号的老文件名——并镜之前一镜就是一刀，
 * 改名会让存量项目里所有配音一次性失效，白重配一遍。
 */
export function voiceoverPath(projectId: string, shotOrder: number, cutIndex = 0): string {
  const stem = `vo-${String(shotOrder).padStart(2, "0")}${cutIndex > 0 ? `-${cutIndex}` : ""}`;
  return path.join(projectDir(projectId), `${stem}.mp3`);
}

/** 合成出来的成片。重跑覆盖，永远只有一份「最新的成片」。 */
export function finalCutPath(projectId: string): string {
  return path.join(projectDir(projectId), "final.mp4");
}

/** 某一镜盘上已有的那张首帧；扩展名逐个试，没有就是 null。 */
export async function findFramePath(projectId: string, shotOrder: number): Promise<string | null> {
  for (const extension of Object.keys(MIME_BY_EXTENSION)) {
    const candidate = framePath(projectId, shotOrder, extension);
    if (await stat(candidate).then((info) => info.isFile(), () => false)) return candidate;
  }
  return null;
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
    // 老项目的 approvedFrames 是按镜号记的确认，摘出来换成哈希，不再跟着项目写回去
    const { approvedFrames: legacyApproved, ...project } = { genProvider: "grok-cli", ...parsed } as VideoProject & {
      approvedFrames?: unknown;
    };
    // 同理，加场景槽位之前存的项目 cast 里只有角色和产品，缺的槽位补成未绑定；
    // 加合成步骤之前存的项目没有 voiceovers / finalCut，界面会直接读它们的长度
    return {
      ...project,
      cast: { ...EMPTY_CAST, ...project.cast },
      voiceovers: project.voiceovers ?? [],
      finalCut: project.finalCut ?? null,
      approvedFrameHashes: project.approvedFrameHashes ?? (await legacyApprovedHashes(projectId, legacyApproved)),
    };
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

/**
 * 首帧确认改成记图之前，存的是镜号。按镜号换成那一镜当前首帧的哈希：
 * 那时换图都会撤确认，所以盘上留着的确认对的就是现在这张图。
 */
async function legacyApprovedHashes(projectId: string, orders: unknown): Promise<string[]> {
  if (!Array.isArray(orders)) return [];
  const hashes = await Promise.all(orders.map((order) => currentFrameHash(projectId, Number(order))));
  return hashes.filter((hash): hash is string => Boolean(hash));
}

/** 某一镜当前首帧的内容哈希；还没有首帧就是 null。 */
export async function currentFrameHash(projectId: string, shotOrder: number): Promise<string | null> {
  const frame = await findFramePath(projectId, shotOrder);
  return frame ? fileHash(frame) : null;
}

/**
 * 首帧哈希按「路径 + 修改时间 + 大小」缓存：自动存盘每次都要现算已确认镜号，
 * 图没动就只花一次 stat，不必把几 MB 的图整张再读一遍。
 */
const frameHashCache = new Map<string, { mtimeMs: number; size: number; hash: string }>();

async function fileHash(file: string): Promise<string> {
  const { mtimeMs, size } = await stat(file);
  const cached = frameHashCache.get(file);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) return cached.hash;
  const hash = createHash("sha256").update(await readFile(file)).digest("hex");
  frameHashCache.set(file, { mtimeMs, size, hash });
  return hash;
}

/** 当前首帧已确认的镜号：逐镜拿盘上那张图的哈希去比，图换了确认就不算了。 */
export async function approvedFrameOrders(project: VideoProject): Promise<number[]> {
  if (!project.approvedFrameHashes.length) return [];
  const approved = new Set(project.approvedFrameHashes);
  const orders = project.storyboard?.shots.map((shot) => shot.order) ?? [];
  const hashes = await Promise.all(orders.map((order) => currentFrameHash(project.id, order)));
  return orders.filter((_, index) => approved.has(hashes[index] ?? ""));
}

/**
 * 同一个项目的读改写排队执行。
 * 绑定、出片、合成、自动存盘都会读一份再整份写回，交错起来后写的会抹掉先写的那次改动。
 * 本机单进程，进程内排队就够了。
 */
const projectLocks = new Map<string, Promise<unknown>>();

export function withProjectLock<T>(projectId: string, task: () => Promise<T>): Promise<T> {
  const previous = projectLocks.get(projectId) ?? Promise.resolve();
  const run = previous.then(task, task);
  const settled = run.catch(() => undefined);
  projectLocks.set(projectId, settled);
  void settled.then(() => {
    if (projectLocks.get(projectId) === settled) projectLocks.delete(projectId);
  });
  return run;
}

/**
 * 读盘上最新的项目、改、写回，整段排队。服务端路由改项目一律走这里，
 * 别拿请求开头读的那份写——合成这种要跑好几分钟的，中途别人写进来的都会被抹掉。
 * 项目不存在时报错，由调用方决定要不要吞。
 */
export async function updateProject(
  projectId: string,
  action: string,
  mutate: (project: VideoProject) => VideoProject | Promise<VideoProject>,
): Promise<VideoProject> {
  return withProjectLock(projectId, async () => {
    const project = await readProject(projectId);
    if (!project) {
      console.error("[VideoFactory] 项目不存在，改动没写进去", { userId: "local", action, projectId });
      throw new Error("项目不存在，先保存项目再操作");
    }
    return writeProject(await mutate(project));
  });
}

/**
 * 把这一镜写进 project.json 的 clips。
 * clips 归服务端所有，项目保存接口不收前端那份——出片、回传、验收都得自己在这里落盘，
 * 否则只有 mp4 躺在盘上、项目却不认它，刷新一下片子就「没了」。
 */
export async function mergeClipIntoProject(projectId: string, clip: ShotClip): Promise<void> {
  try {
    await updateProject(projectId, "videoFactory.clip.merge", (project) => ({
      ...project,
      clips: upsertClip(project.clips, clip),
    }));
  } catch (error) {
    // 片子字节已经落盘了，这里再失败也追不回来，留痕即可，别把整次回传判死
    console.error("[VideoFactory] 成片已落盘但 clips 未更新", {
      userId: "local",
      action: "videoFactory.clip.merge",
      projectId,
      shotOrder: clip.shotOrder,
      error,
    });
  }
}

/**
 * 确认或撤掉某一镜当前这张首帧，回现算的已确认镜号。项目读不到时如实报错——
 * 确认是出片的闸门，悄悄没记上，人会以为确认过了却出不了片。
 */
export async function setFrameApproval(projectId: string, shotOrder: number, approved: boolean): Promise<number[]> {
  const hash = await currentFrameHash(projectId, shotOrder);
  if (!hash) throw new Error(`第 ${shotOrder} 镜还没有首帧`);
  const saved = await updateProject(projectId, "videoFactory.frame.approval", (project) => {
    const rest = project.approvedFrameHashes.filter((item) => item !== hash);
    return { ...project, approvedFrameHashes: approved ? [...rest, hash] : rest };
  });
  return approvedFrameOrders(saved);
}

/** 量一个媒体文件的时长，量不出来回 0，由调用方决定退回哪个值。 */
export async function probeDurationSec(file: string): Promise<number> {
  const out = await runCommand(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { timeoutMs: 30_000 },
  );
  const value = Number(String(out).trim().split("\n")[0]);
  return Number.isFinite(value) && value > 0 ? value : 0;
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
