import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../../feishu/_utils";
import { COLLECT_PLATFORM_HINT, collectNotes, isCollectPlatform } from "@/lib/collector";
import { generateWorkflowJson } from "@/lib/workflowAi";
import {
  buildViralAnalysisPrompt,
  createFallbackViralAnalysis,
  normalizeViralAnalysis,
  type ViralAnalysis,
} from "@/lib/viralSignals";
import type { BloggerNote } from "@/lib/bloggerWorkflow";

export const runtime = "nodejs";

interface NotesRequest {
  platform?: string;
  homeUrl?: string;
  /** 采几条，由调用方决定，不在服务端设默认上限 */
  limit?: number;
  /** 关掉可只采不打分（省 AI 调用） */
  score?: boolean;
}

/**
 * 打分并发度。AI 打分是一条笔记一次调用，串行跑 20 条要几分钟；
 * 全量并发又会撞服务商速率限制。取一个小的固定批次，够快且不易被限流。
 * 这是调用节奏，不是业务规则。
 */
const SCORE_CONCURRENCY = 3;

async function scoreNote(note: BloggerNote, platformLabel: string): Promise<ViralAnalysis> {
  const input = {
    title: note.title,
    content: note.content,
    platform: platformLabel,
    tags: note.tags,
    metrics: note.metrics,
  };
  const fallback = createFallbackViralAnalysis(input);
  const ai = await generateWorkflowJson<ViralAnalysis>({
    action: "blogger.scoreNote",
    prompt: buildViralAnalysisPrompt(input),
    fallback,
    maxTokens: 1200,
  });
  return normalizeViralAnalysis(ai.result, fallback);
}

/**
 * 恒定 SCORE_CONCURRENCY 个 in-flight，而不是分批做 barrier——
 * LLM 单次延迟方差很大，分批会让每一批都等最慢的那条，尾部还空着并发位。
 */
async function scoreAll(notes: BloggerNote[], platformLabel: string): Promise<BloggerNote[]> {
  const scored: BloggerNote[] = new Array(notes.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < notes.length) {
      const index = cursor++;
      const note = notes[index];
      scored[index] = { ...note, analysis: await scoreNote(note, platformLabel) };
    }
  };

  await Promise.all(Array.from({ length: Math.min(SCORE_CONCURRENCY, notes.length) }, worker));
  return scored;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<NotesRequest>(request, "blogger.notes.readJson");
    const homeUrl = body.homeUrl?.trim();
    if (!homeUrl) return apiBadRequest("请粘贴对标账号的主页链接");
    if (!isCollectPlatform(body.platform)) return apiBadRequest(COLLECT_PLATFORM_HINT);

    const { profile, notes } = await collectNotes(body.platform, homeUrl, body.limit);
    if (!notes.length) {
      return apiOk({ profile, notes: [] }, "没采到笔记，请确认主页链接与登录态是否有效");
    }

    if (body.score === false) {
      return apiOk({ profile, notes }, `已采集 ${notes.length} 条笔记（未打分）`);
    }

    // 不在这里排序：唯一消费方拿到后就写库并重读，顺序会被丢掉；
    // 而「未打分」排前还是排后取决于展示场景，规则只留在组件里一份。
    const scored = await scoreAll(notes, profile.platform);
    return apiOk({ profile, notes: scored }, `已采集并打分 ${scored.length} 条笔记`);
  } catch (error) {
    return apiError(error, "blogger.notes", "笔记采集失败");
  }
}
