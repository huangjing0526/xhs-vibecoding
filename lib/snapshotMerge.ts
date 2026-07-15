import {
  TOPIC_STATUS,
  hasContentCardContent,
  hasDraftContent,
  type ContentCard,
  type DraftNote,
} from "./xhsWorkflow";

/**
 * 把飞书 / 本地文档 / 手动录入三路来的原始快照，归并成界面展示的列表。
 *
 * 「两条选题算不算同一条、合并后留谁的字段」是内容规则，改动会直接影响写回飞书的内容。
 */

export function isSameDraft(left: DraftNote, right: DraftNote): boolean {
  return Boolean(
    (left.noteId && left.noteId === right.noteId) ||
      (left.recordId && right.recordId && left.recordId === right.recordId)
  );
}

export function isSameTopic(left: ContentCard, right: ContentCard): boolean {
  return Boolean(
    (left.topicId && left.topicId === right.topicId) ||
      (left.recordId && right.recordId && left.recordId === right.recordId)
  );
}

export function mergeByKey<T>(current: T[], incoming: T[], getKey: (item: T) => string): T[] {
  const next = new Map(current.map((item) => [getKey(item), item]));
  incoming.forEach((item) => next.set(getKey(item), item));
  return Array.from(next.values());
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const map = new Map<string, T>();
  items.forEach((item) => {
    const key = getKey(item);
    if (key) map.set(key, item);
  });
  return Array.from(map.values());
}

function normalizeMergeText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function getTopicMergeKey(topic: ContentCard): string {
  const title = topic.titleCandidates[0] || topic.coreViewpoint;
  return [
    normalizeMergeText(title),
    normalizeMergeText(topic.painPoint),
    normalizeMergeText(topic.targetReader),
  ].join("|");
}

function splitMultiValue(text: string): string[] {
  return text
    .split(/\n|\/|、|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function joinMergedText(values: string[]): string {
  return uniqueValues(values).join("\n");
}

function joinMergedTerms(values: string[]): string {
  return uniqueValues(values.flatMap(splitMultiValue)).join(" / ");
}

function mergeTopicGroup(topics: ContentCard[]): ContentCard {
  const [primary] = topics;
  const titleCandidates = uniqueValues(topics.flatMap((topic) => topic.titleCandidates));
  const sourceMaterials = topics.map((topic) => topic.sourceMaterial);
  const realCases = topics.map((topic) => topic.realCase);
  const reusableAssets = topics.map((topic) => topic.reusableAsset);
  const outlines = uniqueValues(topics.flatMap((topic) => topic.outline));

  return {
    ...primary,
    recordId: topics.length === 1 ? primary.recordId : undefined,
    sourceMaterial: joinMergedText(sourceMaterials),
    relatedTerm: joinMergedTerms(topics.map((topic) => topic.relatedTerm)),
    realCase: joinMergedText(realCases),
    reusableAsset: joinMergedText(reusableAssets),
    titleCandidates,
    coverText: primary.coverText || topics.find((topic) => topic.coverText)?.coverText || "",
    outline: outlines.length > 0 ? outlines : primary.outline,
    commentPrompt: primary.commentPrompt || topics.find((topic) => topic.commentPrompt)?.commentPrompt || "",
    estimatedSaveValue: Math.max(...topics.map((topic) => topic.estimatedSaveValue || 0), primary.estimatedSaveValue || 3),
    status: topics.some((topic) => topic.status === TOPIC_STATUS.pending) ? TOPIC_STATUS.pending : primary.status,
  };
}

function hasSharedTopicSource(topics: ContentCard[], topic: ContentCard): boolean {
  const currentSources = splitMultiValue(topic.sourceMaterial);
  if (currentSources.length === 0) return false;

  const existingSources = new Set(topics.flatMap((item) => splitMultiValue(item.sourceMaterial)));
  return currentSources.some((source) => existingSources.has(source));
}

function hasSharedRealCase(topics: ContentCard[], topic: ContentCard): boolean {
  const currentCase = normalizeMergeText(topic.realCase);
  return Boolean(currentCase && topics.some((item) => normalizeMergeText(item.realCase) === currentCase));
}

function canMergeTopicIntoGroup(topics: ContentCard[], topic: ContentCard): boolean {
  const [primary] = topics;
  if (!primary || getTopicMergeKey(primary) !== getTopicMergeKey(topic)) return false;

  return hasSharedTopicSource(topics, topic) || hasSharedRealCase(topics, topic);
}

function mergeRelatedTopics(topics: ContentCard[]): ContentCard[] {
  const groups: ContentCard[][] = [];

  topics.forEach((topic) => {
    const existingGroup = groups.find((group) => canMergeTopicIntoGroup(group, topic));
    if (existingGroup) existingGroup.push(topic);
    else groups.push([topic]);
  });

  return groups.map(mergeTopicGroup);
}

export function getUsableTopics(topics: ContentCard[]): ContentCard[] {
  const uniqueTopics = dedupeByKey(topics.filter(hasContentCardContent), (topic) => topic.topicId || topic.recordId || "");
  return mergeRelatedTopics(uniqueTopics).sort((left, right) => (right.selectionScore || 0) - (left.selectionScore || 0));
}

export function getUsableDrafts(drafts: DraftNote[]): DraftNote[] {
  return dedupeByKey(drafts.filter(hasDraftContent), (draft) => draft.noteId || draft.recordId || "").sort(
    (left, right) => (right.qualityScoreBeforeWrite || 0) - (left.qualityScoreBeforeWrite || 0)
  );
}
