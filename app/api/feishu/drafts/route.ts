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
  normalizeDraftNote,
} from "@/lib/xhsWorkflow";
import { firstThreeLines, hasCollectibleAsset } from "@/lib/contentStrategy";
import { scoreTopicCards } from "@/lib/topicScoring";

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
    const recentDrafts = writeBack ? (await searchFeishuRecords("draft")).map(normalizeDraftNote) : [];
    const cards = scoreTopicCards(filterUsableContentCards(sourceCards), {
      recentTopics: body.cards ? [] : filterUsableContentCards(sourceCards),
      recentDrafts,
    }).slice(0, count);

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
      const normalizedDraft = normalizeGeneratedDraft(aiResult.result, { ...fallbackDraft, topicId: card.topicId });
      drafts.push({
        ...normalizedDraft,
        qualityScoreBeforeWrite: card.selectionScore,
        collectibleAssetPreview:
          normalizedDraft.collectibleAssetPreview || card.reusableAsset || normalizedDraft.collectibleAssetPreview,
        openingHookPreview: normalizedDraft.openingHookPreview || firstThreeLines(normalizedDraft.content),
        similarityRisk:
          card.avoidSimilarTo?.length && hasCollectibleAsset(normalizedDraft, card)
            ? normalizedDraft.similarityRisk || "medium"
            : normalizedDraft.similarityRisk || "low",
        contentLane: normalizedDraft.contentLane || card.contentLane,
        referencePool: normalizedDraft.referencePool || card.referencePool,
        viralTitleStructure: normalizedDraft.viralTitleStructure || card.viralTitleStructure,
        viralBodyStructure: normalizedDraft.viralBodyStructure || card.viralBodyStructure,
        hookType: normalizedDraft.hookType || card.hookType,
        assetType: normalizedDraft.assetType || card.assetType,
      });
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
