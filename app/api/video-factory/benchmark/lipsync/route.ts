import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk } from "@/app/api/feishu/_utils";
import { benchmarkClipPath, benchmarkDir, isSafeSegment } from "@/app/api/video-factory/_shared";
import { findLipsync, runLipsync } from "@/app/api/video-factory/benchmark/_lipsync";
import { readRhythm } from "@/app/api/video-factory/benchmark/_rhythm";
import { clipsAllowed, planTalkingShot } from "@/lib/videoFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 一条 7 秒的镜头实测约四分钟，长镜头会更久
export const maxDuration = 1200;

/**
 * 把某一镜的原片段改成在说你自己的词。
 *
 * 这是编辑通道的最后一道：切片编辑换完主体，口型还是原片说原话时的口型，
 * 补这一道才算换完。输入是这一镜已经切出来的原片段加一段你自己的配音。
 *
 * 走本机 Wav2Lip，慢但不花钱、素材也不出本机。脸太大的镜头它会糊，
 * 那种镜头 planTalkingShot 会建议走数字人——但建议归建议，这里不拦，
 * 拦了人就没法自己看一眼再决定。
 */
export async function POST(request: NextRequest) {
  let id = "";
  try {
    const form = await request.formData();
    id = String(form.get("id") || "").trim();
    const shot = Number(form.get("shot") || 0);
    const audio = form.get("audio");

    if (!isSafeSegment(id)) return apiBadRequest("节奏 id 不合法");
    if (!Number.isInteger(shot) || shot < 1) return apiBadRequest("镜号不合法");
    if (!(audio instanceof File) || !audio.size) return apiBadRequest("要传一段配音");

    const found = await findLipsync();
    if ("missing" in found) return apiBadRequest(found.missing);

    const rhythm = await readRhythm(id);
    if (!rhythm) return apiBadRequest("这份节奏模板不在了");
    // 原片段是这一步的输入，所以水印那道闸在这儿同样要过
    if (!clipsAllowed(rhythm)) return apiBadRequest("这条原片还没确认过水印，不能拿来改口型");

    const face = benchmarkClipPath(id, shot);
    if (!(await readFile(face).catch(() => null))) {
      return apiBadRequest(`第 ${shot} 镜没有切出原片段，先确认水印让它切出来`);
    }

    const dir = benchmarkDir(id);
    const audioFile = path.join(dir, `lipsync-${String(shot).padStart(2, "0")}-in${path.extname(audio.name) || ".wav"}`);
    const outfile = path.join(dir, `lipsync-${String(shot).padStart(2, "0")}.mp4`);
    await writeFile(audioFile, Buffer.from(await audio.arrayBuffer()));

    const startedAt = Date.now();
    await runLipsync(face, audioFile, outfile);
    const seconds = Math.round((Date.now() - startedAt) / 1000);

    const target = rhythm.shots.find((item) => item.order === shot);
    const plan = target ? planTalkingShot(rhythm, target) : null;

    console.info("[VideoFactory] 改口型完成", {
      userId: "local",
      action: "videoFactory.benchmark.lipsync",
      id,
      shot,
      seconds,
    });
    return apiOk(
      { shot, seconds, plan },
      plan?.approach === "avatar"
        ? `第 ${shot} 镜改完了（${seconds} 秒），但${plan.why}——先看一眼，糊的话这一镜换数字人`
        : `第 ${shot} 镜改完了，用时 ${seconds} 秒`,
    );
  } catch (error) {
    console.error("[VideoFactory] 改口型失败", { userId: "local", action: "videoFactory.benchmark.lipsync", id });
    return apiError(error, "videoFactory.benchmark.lipsync", "改口型失败");
  }
}
