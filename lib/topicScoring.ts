import {
  deriveStrategyForCard,
  getSimilarityNeedle,
  inferAssetType,
  titleMatchesStructure,
} from "./contentStrategy";
import type { ContentCard, DraftNote, SimilarityRisk } from "./xhsWorkflow";

export interface TopicScoringContext {
  recentTopics?: ContentCard[];
  recentDrafts?: DraftNote[];
}

export interface TopicScoreBreakdown {
  sceneSpecificity: number;
  assetStrength: number;
  structureFit: number;
  freshness: number;
  laneBalance: number;
  firsthand: number;
}

const SCENE_KEYWORDS = /开会|周报|面试|汇报|写方案|写总结|做表|发版|客户|同事|需求|复盘|下班前|家庭|带娃|英语|读书|面谈/;
const FIRSTHAND_KEYWORDS = /我试了|我发现|这次|踩坑|复盘|一周|第三次|后来|我现在|我固定用/;

function normalizeNeedles(context: TopicScoringContext): string[] {
  return [
    ...(context.recentTopics || []).map((topic) => getSimilarityNeedle(topic)),
    ...(context.recentDrafts || []).map((draft) => getSimilarityNeedle(draft)),
  ].filter(Boolean);
}

function calcSimilarityRisk(card: ContentCard, context: TopicScoringContext): SimilarityRisk {
  const titleNeedle = getSimilarityNeedle(card);
  const avoid = (card.avoidSimilarTo || []).map((item) => item.replace(/\s+/g, "").toLowerCase());
  const recent = normalizeNeedles(context);
  const related = [...avoid, ...recent];

  const strongHit = related.some((item) => item && (titleNeedle.includes(item) || item.includes(titleNeedle)));
  if (strongHit) return "high";

  const weakHit = related.some((item) => {
    if (!item || item.length < 6 || titleNeedle.length < 6) return false;
    const shorter = item.length < titleNeedle.length ? item : titleNeedle;
    const longer = item.length < titleNeedle.length ? titleNeedle : item;
    return shorter.length >= 4 && longer.includes(shorter.slice(0, Math.min(6, shorter.length)));
  });
  return weakHit ? "medium" : "low";
}

function scoreSceneSpecificity(card: ContentCard): number {
  const text = [card.titleCandidates[0], card.painPoint, card.realCase].filter(Boolean).join(" ");
  if (SCENE_KEYWORDS.test(text) && card.realCase.trim()) return 25;
  if (SCENE_KEYWORDS.test(text) || card.realCase.trim()) return 18;
  if (card.painPoint.trim()) return 12;
  return 6;
}

function scoreAssetStrength(card: ContentCard): number {
  const asset = card.reusableAsset.trim();
  const inferred = card.assetType || inferAssetType(asset);
  if (!asset) return 4;
  if (inferred && /(提示词|清单|字段|三问|练习|模板|prompt)/i.test(asset)) return 20;
  if (inferred) return 16;
  return 10;
}

function scoreStructureFit(card: ContentCard): number {
  const title = card.titleCandidates[0] || card.coreViewpoint;
  const titleFit = titleMatchesStructure(title, card.viralTitleStructure);
  const bodyFit = Boolean(card.viralBodyStructure);
  if (titleFit && bodyFit) return 15;
  if (titleFit || bodyFit) return 10;
  return 5;
}

function scoreFreshness(risk: SimilarityRisk): number {
  if (risk === "low") return 15;
  if (risk === "medium") return 8;
  return 1;
}

function scoreLaneBalance(card: ContentCard, context: TopicScoringContext): number {
  const lane = card.contentLane;
  if (!lane) return 8;
  const recentLanes = [...(context.recentTopics || []), ...(context.recentDrafts || [])]
    .map((item) => item.contentLane)
    .filter(Boolean);
  const sameCount = recentLanes.filter((item) => item === lane).length;
  if (sameCount === 0) return 15;
  if (sameCount === 1) return 10;
  return 5;
}

function scoreFirsthand(card: ContentCard): number {
  const text = [card.titleCandidates[0], card.coreViewpoint, card.realCase].filter(Boolean).join(" ");
  if (FIRSTHAND_KEYWORDS.test(text)) return 10;
  if (/我/.test(text) || card.realCase.trim()) return 7;
  return 3;
}

export function scoreTopicCard(
  card: ContentCard,
  context: TopicScoringContext = {}
): { card: ContentCard; breakdown: TopicScoreBreakdown } {
  const enriched = deriveStrategyForCard(card);
  const similarityRisk = calcSimilarityRisk(enriched, context);

  const breakdown: TopicScoreBreakdown = {
    sceneSpecificity: scoreSceneSpecificity(enriched),
    assetStrength: scoreAssetStrength(enriched),
    structureFit: scoreStructureFit(enriched),
    freshness: scoreFreshness(similarityRisk),
    laneBalance: scoreLaneBalance(enriched, context),
    firsthand: scoreFirsthand(enriched),
  };

  const selectionScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const reasonParts = [
    breakdown.sceneSpecificity >= 18 ? "场景具体" : "",
    breakdown.assetStrength >= 16 ? "资产可收藏" : "",
    breakdown.freshness >= 15 ? "近期不撞题" : breakdown.freshness <= 8 ? "需留意撞题" : "",
    breakdown.laneBalance >= 15 ? "内容线有补位价值" : "",
  ].filter(Boolean);

  return {
    card: {
      ...enriched,
      selectionScore,
      selectionReason: reasonParts.join(" / ") || "结构完整，适合进入待写池",
    },
    breakdown,
  };
}

export function scoreTopicCards(cards: ContentCard[], context: TopicScoringContext = {}): ContentCard[] {
  return cards
    .map((card) => scoreTopicCard(card, context).card)
    .sort((left, right) => (right.selectionScore || 0) - (left.selectionScore || 0));
}
