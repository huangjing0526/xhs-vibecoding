import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../_utils";
import { createFeishuRecords, searchFeishuRecords } from "@/lib/feishu";
import { generateWorkflowJson } from "@/lib/workflowAi";
import {
  buildDraftPrompt,
  ContentCard,
  createFallbackDraft,
  DraftNote,
  filterByStatus,
  filterUsableContentCards,
  mapDraftToFeishuFields,
  normalizeGeneratedDraft,
  normalizeContentCard,
} from "@/lib/xhsWorkflow";

interface DraftsRequest {
  count?: number;
  status?: string;
  writeBack?: boolean;
  cards?: ContentCard[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<DraftsRequest>(request, "drafts.readJson");
    const count = body.count || 3;
    const status = body.status || "待写";
    const writeBack = body.writeBack !== false;
    const sourceCards =
      body.cards ||
      filterByStatus((await searchFeishuRecords("topic")).map(normalizeContentCard), status);
    const cards = filterUsableContentCards(sourceCards).slice(0, count);

    if (cards.length === 0) {
      return apiBadRequest("没有找到待写选题，请先生成内容卡片");
    }

    const drafts: DraftNote[] = [];
    const providers = new Set<string>();
    let usedFallback = false;

    for (const card of cards.slice(0, count)) {
      const fallbackDraft = createFallbackDraft(card);
      const aiResult = await generateWorkflowJson<DraftNote>({
        action: "drafts.generateOne",
        prompt: buildDraftPrompt(card),
        fallback: fallbackDraft,
        maxTokens: 3500,
      });
      providers.add(aiResult.provider);
      usedFallback = usedFallback || aiResult.usedFallback;
      drafts.push(normalizeGeneratedDraft(aiResult.result, { ...fallbackDraft, topicId: card.topicId }));
    }

    let writeResult: unknown = null;
    if (writeBack) {
      writeResult = await createFeishuRecords(
        "draft",
        drafts.map((draft) => ({ fields: mapDraftToFeishuFields(draft) }))
      );
    }

    return apiOk(
      {
        drafts,
        writeBack,
        writeResult,
        usedFallback,
        provider: Array.from(providers).join(","),
      },
      usedFallback ? "未检测到 AI 配置，已用规则生成草稿" : "笔记草稿生成成功"
    );
  } catch (error) {
    return apiError(error, "drafts.generate", "笔记草稿生成失败");
  }
}
