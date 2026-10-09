import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "@/app/api/feishu/_utils";
import { mimeByExtension } from "@/app/api/image-factory/_shared";
import {
  isSafeSegment,
  mergeClipIntoProject,
  probeDurationSec,
  projectDir,
  readProject,
  runCommand,
} from "@/app/api/video-factory/_shared";
import {
  QA_FRAMES_PER_SEC,
  QA_SHEET_COLUMNS,
  buildClipQaPrompt,
  normalizeClipQa,
  shotProductRisks,
  shotReferences,
  type ClipQa,
  type ClipQaGate,
} from "@/lib/videoFactory";
import { generateWorkflowJson, type WorkflowImage } from "@/lib/workflowAi";

// 跑本机 ffmpeg、可能调本机 codex 看图，必须 nodejs runtime。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** 联系表里每帧缩到多宽。再大模型那边也会缩，再小人脸和印花就糊成一团 */
const SHEET_FRAME_WIDTH = 240;
/** 尾段冻住多久算冻住：和抽帧间隔一致，一个抽帧格整格不动就算 */
const TAIL_FREEZE_SEC = 1 / QA_FRAMES_PER_SEC;
/** 参考图最多带几张，再多模型分不清谁是谁 */
const MAX_REFERENCE_IMAGES = 3;

async function readImage(file: string): Promise<WorkflowImage | null> {
  const bytes = await readFile(file).catch(() => null);
  if (!bytes) return null;
  const mimeType = mimeByExtension(path.extname(file)) as WorkflowImage["mimeType"];
  return { mimeType, base64: bytes.toString("base64") };
}

/** 每 0.25 秒抽一帧拼成一张联系表：一次看图调用看完整段，不逐帧调。 */
async function buildContactSheet(videoPath: string, durationSec: number, output: string): Promise<void> {
  const rows = Math.max(1, Math.ceil((durationSec * QA_FRAMES_PER_SEC) / QA_SHEET_COLUMNS));
  await runCommand(
    "ffmpeg",
    [
      "-nostdin", "-v", "error", "-y",
      "-i", videoPath,
      "-vf", `fps=${QA_FRAMES_PER_SEC},scale=${SHEET_FRAME_WIDTH}:-2,tile=${QA_SHEET_COLUMNS}x${rows}:padding=4:color=white`,
      "-frames:v", "1",
      output,
    ],
    { timeoutMs: 60_000, timeoutMessage: "抽验收帧超时" },
  );
}

/**
 * 尾帧有没有冻住，交给 ffmpeg 量而不是让模型猜：
 * 冻结段开始了却一直没结束，说明画面停着进了片尾。
 */
async function measureTail(videoPath: string, durationSec: number): Promise<ClipQaGate> {
  const log = await runCommand(
    "ffmpeg",
    ["-nostdin", "-i", videoPath, "-vf", `freezedetect=n=-60dB:d=${TAIL_FREEZE_SEC}`, "-map", "0:v", "-f", "null", "-"],
    { timeoutMs: 60_000, timeoutMessage: "检测尾帧超时" },
  );
  const starts = [...log.matchAll(/freeze_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const ends = [...log.matchAll(/freeze_end:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const lastStart = starts.length ? starts[starts.length - 1] : null;
  const frozenToEnd = lastStart !== null && starts.length > ends.length && durationSec - lastStart >= TAIL_FREEZE_SEC;
  return frozenToEnd
    ? { id: "tail", verdict: "fail", evidence: `从第 ${lastStart!.toFixed(1)} 秒起画面不动，一直停到结尾` }
    : { id: "tail", verdict: "pass", evidence: "画面一直动到最后一帧" };
}

/**
 * 验收一镜：check 跑一遍自动验收；override 是人看过之后写理由放行。
 * 结论记在这一镜的 ShotClip 上，片子一换就作废。
 */
export async function POST(request: NextRequest) {
  let projectId = "";
  let shotOrder = 0;
  let action = "";
  try {
    const body = await readJsonBody<{ projectId?: string; shotOrder?: number; action?: string; reason?: string }>(
      request,
      "videoFactory.clipQa.readJson",
    );
    projectId = String(body.projectId || "").trim();
    shotOrder = Number(body.shotOrder || 0);
    action = body.action === "override" ? "override" : "check";

    if (!isSafeSegment(projectId)) return apiBadRequest("项目 id 不合法");
    if (!Number.isInteger(shotOrder) || shotOrder < 1 || shotOrder > 99) return apiBadRequest("镜号不合法");

    const project = await readProject(projectId);
    if (!project) return apiBadRequest("项目不存在");
    const clip = project.clips.find((item) => item.shotOrder === shotOrder);
    if (!clip) return apiBadRequest(`第 ${shotOrder} 镜还没有成片`);

    if (action === "override") {
      const reason = String(body.reason || "").trim();
      if (!reason) return apiBadRequest("放行要写一句理由，回头对误判时要看");
      const qa: ClipQa = {
        status: "override",
        gates: clip.qa?.gates ?? [],
        checkedAt: clip.qa?.checkedAt ?? new Date().toISOString(),
        provider: clip.qa?.provider ?? "",
        overrideReason: reason,
      };
      await mergeClipIntoProject(projectId, { ...clip, qa });
      return apiOk({ shotOrder, qa }, `第 ${shotOrder} 镜已放行`);
    }

    const shot = project.storyboard?.shots.find((item) => item.order === shotOrder);
    if (!shot) return apiBadRequest(`分镜表里没有第 ${shotOrder} 镜`);

    const durationSec = (await probeDurationSec(clip.videoPath)) || clip.durationSec;
    const sheetPath = path.join(projectDir(projectId), `qa-${String(shotOrder).padStart(2, "0")}.jpg`);
    await rm(sheetPath, { force: true });
    // 两遍互不相干，并着跑
    const [, tail] = await Promise.all([
      buildContactSheet(clip.videoPath, durationSec, sheetPath),
      measureTail(clip.videoPath, durationSec),
    ]);

    const references = shotReferences(project, shot);
    const [sheet, frame, ...referenceImages] = await Promise.all([
      readImage(sheetPath),
      readImage(clip.framePath),
      ...references.slice(0, MAX_REFERENCE_IMAGES).map((item) => readImage(item.ref.path)),
    ]);
    if (!sheet) throw new Error("验收帧没抽出来");
    if (!frame) return apiBadRequest(`第 ${shotOrder} 镜的首帧已经不在了，重出首帧后再验收`);

    // 图的顺序就是提示词里写的编号：联系表、首帧、参考图。读不到的参考图连同它的说明一起拿掉
    const usable = references
      .slice(0, MAX_REFERENCE_IMAGES)
      .map((item, index) => ({ item, image: referenceImages[index] }))
      .filter((pair): pair is { item: (typeof references)[number]; image: WorkflowImage } => Boolean(pair.image));

    const ai = await generateWorkflowJson<Parameters<typeof normalizeClipQa>[0]>({
      action: "videoFactory.clipQa",
      prompt: buildClipQaPrompt({ shot, references: usable.map((pair) => pair.item), risks: shotProductRisks(references) }),
      fallback: {},
      images: [sheet, frame, ...usable.map((pair) => pair.image)],
      maxTokens: 2000,
    });
    if (ai.usedFallback) {
      return apiBadRequest("没配置能看图的模型，自动验收跑不了；看过片子后可以写理由放行");
    }

    const qa = normalizeClipQa(ai.result, tail, ai.provider);
    await mergeClipIntoProject(projectId, { ...clip, qa });
    return apiOk(
      { shotOrder, qa },
      qa.status === "pass" ? `第 ${shotOrder} 镜验收通过` : `第 ${shotOrder} 镜有没过的关`,
    );
  } catch (error) {
    console.error("[VideoFactory] 验收失败", { userId: "local", action: `videoFactory.clipQa.${action}`, projectId, shotOrder });
    return apiError(error, "videoFactory.clipQa", "验收失败");
  }
}
