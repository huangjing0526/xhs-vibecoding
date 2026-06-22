import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../_utils";
import { generateWorkflowJson } from "@/lib/workflowAi";
import {
  buildClueExtractionPrompt,
  CLUE_SOURCE_LABEL,
  createFallbackClues,
  fetchClueContent,
  type ClueSourceType,
  type ExtractedClue,
} from "@/lib/clueIntake";

interface ClueRequest {
  /** 公开线索链接（X / GitHub / 网页） */
  url?: string;
  /** 直接粘贴的原文（给抓不到的场景兜底） */
  rawText?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<ClueRequest>(request, "clues.readJson");
    const url = body.url?.trim();
    const rawText = body.rawText?.trim();

    if (!url && !rawText) {
      return apiBadRequest("请粘贴一条线索链接或原文");
    }

    const fetched = url ? await fetchClueContent(url) : null;
    const sourceType: ClueSourceType = fetched ? fetched.sourceType : "web";
    const text = fetched ? fetched.text : (rawText as string);
    if (!text) {
      return apiBadRequest(fetched?.emptyHint || "没抓到正文内容，请改为直接粘贴原文");
    }

    const fallback = createFallbackClues(text, sourceType);
    const aiResult = await generateWorkflowJson<ExtractedClue[]>({
      action: "clues.extract",
      prompt: buildClueExtractionPrompt(text, sourceType),
      fallback,
      maxTokens: 1500,
    });

    const t = (value?: string) => (value || "").trim();
    const candidates: ExtractedClue[] = (Array.isArray(aiResult.result) ? aiResult.result : fallback)
      .filter((clue) => clue && clue.event?.trim())
      .map((clue) => ({
        event: t(clue.event),
        method: t(clue.method),
        pitfall: t(clue.pitfall),
        relatedTerm: t(clue.relatedTerm),
      }));

    if (candidates.length === 0) {
      return apiBadRequest("这条线索没提炼出可用素材，可换一条或直接手动新增");
    }

    const label = CLUE_SOURCE_LABEL[sourceType];
    return apiOk(
      {
        candidates,
        sourceType: label,
        usedFallback: aiResult.usedFallback,
        provider: aiResult.provider,
      },
      aiResult.usedFallback ? "未检测到 AI 配置，已原样抓取为待提炼素材" : `已从${label}提炼 ${candidates.length} 条素材候选`
    );
  } catch (error) {
    return apiError(error, "clues.extract", "线索提炼失败");
  }
}
