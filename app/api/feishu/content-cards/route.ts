import { NextRequest } from "next/server";
import { apiBadRequest, apiError, apiOk, readJsonBody } from "../_utils";
import { createFeishuRecords, searchFeishuRecords, updateFeishuRecord } from "@/lib/feishu";
import { generateWorkflowJson } from "@/lib/workflowAi";
import {
  buildContentCardPrompt,
  ContentCard,
  createFallbackContentCards,
  filterByStatus,
  filterUsableContentCards,
  filterUsableGlossary,
  filterUsableMaterials,
  mapContentCardToFeishuFields,
  normalizeGeneratedContentCard,
  normalizeContentCard,
  normalizeGlossary,
  normalizeMaterial,
  MaterialItem,
  GlossaryItem,
  normalizeDraftNote,
  MATERIAL_STATUS,
} from "@/lib/xhsWorkflow";
import { scoreTopicCards } from "@/lib/topicScoring";

interface ContentCardsRequest {
  count?: number;
  status?: string;
  writeBack?: boolean;
  materials?: MaterialItem[];
  glossary?: GlossaryItem[];
}

function sourceMaterialParts(value: string): string[] {
  const explicitParts = value
    .split(/\n|\/|、|，|｜|\|/)
    .map((source) => source.trim())
    .filter(Boolean);
  const sourceIdParts = value.match(/[A-Z]+-[A-Za-z0-9-]+/g) || [];

  return Array.from(new Set([...explicitParts, ...sourceIdParts]));
}

function findExistingTopicForCard(card: ContentCard, existingTopics: ContentCard[]): ContentCard | undefined {
  const cardSources = sourceMaterialParts(card.sourceMaterial);
  return existingTopics.find((topic) => {
    if (card.topicId && topic.topicId === card.topicId) return true;

    const topicSources = new Set(sourceMaterialParts(topic.sourceMaterial));
    return cardSources.some((source) => topicSources.has(source));
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<ContentCardsRequest>(request, "contentCards.readJson");
    const count = body.count || 5;
    const status = body.status || MATERIAL_STATUS.pending;
    const writeBack = body.writeBack !== false;

    const sourceMaterials =
      body.materials ||
      filterByStatus((await searchFeishuRecords("material")).map(normalizeMaterial), status);
    const materials = filterUsableMaterials(sourceMaterials);
    const targetCount = Math.min(count, materials.length);
    const glossary = filterUsableGlossary(
      body.glossary || (await searchFeishuRecords("glossary")).map(normalizeGlossary)
    );

    if (materials.length === 0) {
      return apiBadRequest("没有找到可提炼的素材，请检查素材库状态");
    }

    const fallbackCards = createFallbackContentCards(materials, glossary, targetCount);
    const aiResult = await generateWorkflowJson<{ cards: ContentCard[] }>({
      action: "contentCards.generate",
      prompt: buildContentCardPrompt(materials, glossary, targetCount),
      fallback: { cards: fallbackCards },
      maxTokens: 4500,
    });

    const rawCards = Array.isArray(aiResult.result.cards) ? aiResult.result.cards : fallbackCards;
    const normalizedCards = rawCards
      .slice(0, targetCount)
      .map((card, index) => normalizeGeneratedContentCard(card, fallbackCards[index] || fallbackCards[0]));
    const recentTopics = writeBack ? (await searchFeishuRecords("topic")).map(normalizeContentCard) : [];
    const recentDrafts = writeBack ? (await searchFeishuRecords("draft")).map(normalizeDraftNote) : [];
    const cards = scoreTopicCards(normalizedCards, { recentTopics, recentDrafts });

    let writeResult: unknown = null;
    let skippedExisting = 0;
    let updatedExisting = 0;
    let updatedMaterials = 0;
    if (writeBack) {
      const existingTopics = filterUsableContentCards(recentTopics);
      const existingTopicIds = new Set(existingTopics.map((topic) => topic.topicId).filter(Boolean));
      const cardsToCreate = cards.filter(
        (card) => !existingTopicIds.has(card.topicId) && !findExistingTopicForCard(card, existingTopics)
      );
      const cardsToUpdate = cards
        .map((card) => ({ card, existingTopic: findExistingTopicForCard(card, existingTopics) }))
        .filter(({ card, existingTopic }) => {
          return Boolean(existingTopic?.recordId && !cardsToCreate.some((item) => item.topicId === card.topicId));
        });
      const updatedRecordIds = new Set<string>();
      const updateResults = [];

      for (const { card, existingTopic } of cardsToUpdate) {
        if (!existingTopic?.recordId || updatedRecordIds.has(existingTopic.recordId)) continue;
        updatedRecordIds.add(existingTopic.recordId);
        updateResults.push(
          await updateFeishuRecord(
            "topic",
            existingTopic.recordId,
            mapContentCardToFeishuFields({
              ...card,
              sourceMaterial: existingTopic.sourceMaterial || card.sourceMaterial,
            })
          )
        );
      }

      updatedExisting = updateResults.length;
      skippedExisting = Math.max(cards.length - cardsToCreate.length - updatedExisting, 0);
      const createResult = await createFeishuRecords(
        "topic",
        cardsToCreate.map((card) => ({ fields: mapContentCardToFeishuFields(card) }))
      );
      const materialUpdateResults = [];
      const updatedMaterialRecordIds = new Set<string>();
      for (const material of materials) {
        if (!material.recordId || updatedMaterialRecordIds.has(material.recordId)) continue;
        updatedMaterialRecordIds.add(material.recordId);
        materialUpdateResults.push(
          await updateFeishuRecord("material", material.recordId, { "状态": MATERIAL_STATUS.extracted })
        );
      }
      updatedMaterials = materialUpdateResults.length;
      writeResult = { created: createResult, updated: updateResults, materials: materialUpdateResults };
    }

    return apiOk(
      {
        cards,
        writeBack,
        writeResult,
        skippedExisting,
        updatedExisting,
        updatedMaterials,
        usedFallback: aiResult.usedFallback,
        provider: aiResult.provider,
      },
      aiResult.usedFallback
        ? "未检测到 AI 配置，已用规则生成内容卡片"
        : "内容卡片生成成功"
    );
  } catch (error) {
    return apiError(error, "contentCards.generate", "内容卡片生成失败");
  }
}
