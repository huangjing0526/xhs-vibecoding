import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { JOB_ROOT, isSafeSegment, type WorkRecord } from "@/app/api/image-factory/_shared";
import { byCreatedAtDesc } from "@/lib/collections";
import type { WorkEntry } from "@/lib/imageFactory";

/**
 * 作品：每次生成落在 .local/image-factory/jobs 下的产出。
 *
 * 产物本来就一直写在那儿，但没有元数据，回头翻只能看到一堆 output.png，认不出是什么模板、
 * 什么视角、用哪个引擎跑的。所以生成成功时在产物旁边写一份 meta.json，作品页扫的就是它——
 * 没有 meta.json 的目录（改版前的旧产物、跑挂了的半成品）一律不进列表。
 */

const META_FILE = "meta.json";

/** 产物目录名由前端的任务 key 决定（`<模板id>` 或 `<模板id>__<视角id>`），拼路径前必须校验。 */
export function isWorkLocation(jobId: string, dir: string): boolean {
  return isSafeSegment(jobId) && (dir === "" || isSafeSegment(dir));
}

function workDir(jobId: string, dir: string): string {
  return dir ? path.join(JOB_ROOT, jobId, dir) : path.join(JOB_ROOT, jobId);
}

/** 图片不内联进列表 JSON：列表只回取图地址，浏览器按需拉、按地址缓存。 */
function toWorkEntry(record: WorkRecord): WorkEntry {
  const query = new URLSearchParams({ job: record.jobId, dir: record.dir });
  return {
    ...record,
    id: `${record.jobId}/${record.dir}`,
    imageUrl: `/api/image-factory/works/image?${query.toString()}`,
    outputPath: path.join(workDir(record.jobId, record.dir), record.file),
  };
}

async function readMeta(jobId: string, dir: string): Promise<WorkRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(path.join(workDir(jobId, dir), META_FILE), "utf8"));
    return parsed && typeof parsed === "object" ? { ...parsed, jobId, dir } : null;
  } catch (error) {
    // 没有 meta.json 是常态（旧产物、失败的运行），只有读坏了才值得留痕
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[ImageFactory] 作品元数据读取失败", {
        userId: "local",
        action: "imageFactory.works.readMeta",
        jobId,
        dir,
        error,
      });
    }
    return null;
  }
}

/** 生成成功后调用：把这张图是怎么来的记在它旁边。失败的运行不写，列表里就不会出现半成品。 */
export async function writeWorkMeta(
  jobDir: string,
  record: Omit<WorkRecord, "jobId" | "dir">
): Promise<void> {
  await writeFile(path.join(jobDir, META_FILE), JSON.stringify(record, null, 2), "utf8");
}

/**
 * 全部作品，按生成时间倒序。
 * 一次运行的多个视角各占一个子目录，所以要扫两层：运行目录本身 + 它的子目录。
 */
export async function listWorks(): Promise<WorkEntry[]> {
  let runs: string[];
  try {
    runs = (await readdir(JOB_ROOT, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  // 各运行目录互不依赖，并行读——串行时几十个 job 的几百次 fs 调用是列表接口的长尾
  const perRun = await Promise.all(
    runs.filter(isSafeSegment).map(async (jobId) => {
      const records: WorkRecord[] = [];
      const own = await readMeta(jobId, "");
      if (own) records.push(own);

      const children = await readdir(path.join(JOB_ROOT, jobId), { withFileTypes: true }).catch(() => []);
      const metas = await Promise.all(
        children
          // inputs 存的是参考图，不是产出，不进作品列表
          .filter((child) => child.isDirectory() && child.name !== "inputs" && isSafeSegment(child.name))
          .map((child) => readMeta(jobId, child.name)),
      );
      for (const meta of metas) if (meta) records.push(meta);
      return records;
    }),
  );

  return perRun.flat().sort(byCreatedAtDesc).map(toWorkEntry);
}

export async function readWorkImage(
  jobId: string,
  dir: string
): Promise<{ bytes: Buffer; extension: string } | null> {
  const record = await readMeta(jobId, dir);
  if (!record) return null;
  const filePath = path.join(workDir(jobId, dir), record.file);
  const bytes = await readFile(filePath).catch(() => null);
  return bytes ? { bytes, extension: path.extname(filePath).toLowerCase() } : null;
}

/**
 * 删一件作品。
 * 一次运行的最后一个视角被删掉后，剩下的只有参考图，留着就是垃圾，整个运行目录一起清掉。
 */
export async function deleteWork(jobId: string, dir: string): Promise<boolean> {
  if (!(await readMeta(jobId, dir))) return false;

  const runDir = path.join(JOB_ROOT, jobId);
  await rm(workDir(jobId, dir), { recursive: true, force: true });

  if (dir) {
    const remaining = await readdir(runDir, { withFileTypes: true }).catch(() => []);
    let stillHasWork = false;
    for (const entry of remaining) {
      if (!entry.isDirectory() || entry.name === "inputs") continue;
      if (await readMeta(jobId, entry.name)) {
        stillHasWork = true;
        break;
      }
    }
    if (!stillHasWork) await rm(runDir, { recursive: true, force: true });
  }
  return true;
}
