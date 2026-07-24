import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../feishu/_utils";
import { generateWorkflowJson } from "@/lib/workflowAi";
import {
  buildPunctuationPrompt,
  buildScriptAnalysisPrompt,
  createFallbackScriptAnalysis,
  detectVideoPlatform,
  extractShareUrl,
  normalizeVideoUrl,
  VIDEO_PLATFORM_LABEL,
  type ExtractedVideo,
  type ScriptAnalysis,
  type VideoPlatform,
} from "@/lib/videoExtract";

// 抖音/小红书抓取依赖本地 yt-dlp / ffmpeg / whisper，必须走 nodejs runtime 转发到本地拆片服务。
export const runtime = "nodejs";

const EXTRACTOR_URL =
  process.env.VIDEO_EXTRACTOR_URL || process.env.VIDEO_RENDERER_URL || "http://localhost:8787";

interface ExtractRequest {
  /** 抖音/小红书视频链接或分享口令文本 */
  input?: string;
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function normalizeVideo(raw: Record<string, unknown>, url: string): ExtractedVideo {
  // 信任本地服务已识别的平台，非法值再按链接兜底一次。
  const rawPlatform = raw.platform as VideoPlatform;
  return {
    platform: rawPlatform === "douyin" || rawPlatform === "xiaohongshu" ? rawPlatform : detectVideoPlatform(url),
    title: str(raw.title),
    desc: str(raw.desc),
    author: str(raw.author),
    durationSec: typeof raw.durationSec === "number" ? raw.durationSec : 0,
    coverUrl: str(raw.coverUrl),
    videoUrl: str(raw.videoUrl),
    transcript: str(raw.transcript),
    transcriptNote: str(raw.transcriptNote),
  };
}

function normalizeAnalysis(raw: ScriptAnalysis | undefined, fallback: ScriptAnalysis): ScriptAnalysis {
  if (!raw) return fallback;
  const structure = Array.isArray(raw.structure) ? raw.structure : [];
  return {
    hook: str(raw.hook),
    structure: structure
      .filter((s) => s && (str(s.stage) || str(s.text)))
      .map((s) => ({ stage: str(s.stage), purpose: str(s.purpose), text: str(s.text) })),
    style: str(raw.style),
    reusableTemplate: str(raw.reusableTemplate),
    painPoint: str(raw.painPoint),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<ExtractRequest>(request, "video.extract.readJson");
    const input = body.input?.trim();
    if (!input) return apiBadRequest("请粘贴一条抖音/小红书视频链接或分享口令");

    const rawUrl = extractShareUrl(input);
    if (!rawUrl) return apiBadRequest("没识别到链接，请粘贴包含 http(s) 链接的分享内容");
    const url = normalizeVideoUrl(rawUrl);

    // 1. 本地服务抓无水印视频 + 口播脚本
    let resp: Response;
    try {
      resp = await fetch(`${EXTRACTOR_URL}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
    } catch (error) {
      console.error("[api/video/extract] 无法连接本地拆片服务", {
        userId: "local",
        action: "video.extract.proxy",
        extractorUrl: EXTRACTOR_URL,
        message: error instanceof Error ? error.message : String(error),
      });
      return apiError(
        new Error(
          `无法连接本地视频拆片服务（${EXTRACTOR_URL}）。请先在 services/video-renderer 运行 npm install && npm start，并装好 yt-dlp / ffmpeg。`
        ),
        "video.extract.proxy",
        "拆片失败"
      );
    }

    const extractData = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
    if (!resp.ok || !extractData || extractData.error) {
      return apiBadRequest((extractData?.error as string) || `拆片服务返回异常（${resp.status}）`);
    }

    const video = normalizeVideo(extractData, url);
    if (!video.videoUrl) return apiBadRequest("拆片服务没返回视频地址，请换一条链接重试");

    // 2. 口播脚本加标点（whisper 原始转写几乎没标点，阅读不友好）；先加好再拿去拆结构，
    //    这样结构里引用的原文片段也带标点。无 AI 时兜底原样返回。
    if (video.transcript) {
      const punct = await generateWorkflowJson<{ text: string }>({
        action: "video.extract.punctuate",
        prompt: buildPunctuationPrompt(video.transcript),
        fallback: { text: video.transcript },
        maxTokens: Math.min(4000, Math.round(video.transcript.length * 1.5) + 300),
      });
      const punctuated = punct.result?.text?.trim();
      if (punctuated) video.transcript = punctuated;
    }

    // 3. AI 拆脚本结构（无 AI 时回兜底，原样保留脚本）
    const fallback = createFallbackScriptAnalysis(video);
    const ai = await generateWorkflowJson<ScriptAnalysis>({
      action: "video.extract.analyze",
      prompt: buildScriptAnalysisPrompt(video),
      fallback,
      maxTokens: 1800,
    });
    const analysis = normalizeAnalysis(ai.result, fallback);

    const label = VIDEO_PLATFORM_LABEL[video.platform];
    return apiOk(
      { video, analysis, usedFallback: ai.usedFallback, provider: ai.provider },
      ai.usedFallback ? "已抓到视频，但未配置 AI，脚本结构请手动拆解" : `已从${label}拆出视频与脚本结构`
    );
  } catch (error) {
    return apiError(error, "video.extract", "视频拆片失败");
  }
}
