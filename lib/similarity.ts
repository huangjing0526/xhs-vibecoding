// 内容查重 & 防撞车检测

export interface SimilarityResult {
  score: number; // 0-100, 越高越相似
  similarParts: string[];
  suggestions: string[];
  isUnique: boolean;
}

// 常见爆款模板（用于检测是否太套路化）
const COMMON_TEMPLATES = [
  "作为一个xxx，我xxx",
  "今天分享一下xxx",
  "xxx的正确打开方式",
  "xxx必看！",
  "手把手教你xxx",
  "xxx攻略大全",
  "新手必看！xxx",
  "保姆级教程",
  "xxx指南",
  "xxx合集",
];

const OVERUSED_PHRASES = [
  "宝藏分享",
  "干货满满",
  "建议收藏",
  "码住",
  "划重点",
  "墙裂推荐",
  "yyds",
  "绝绝子",
  "太绝了",
  "必须拥有",
  "谁懂啊",
  "一整个xxx住",
];

export function checkSimilarity(
  content: string,
  historyContents: string[]
): SimilarityResult {
  const similarParts: string[] = [];
  const suggestions: string[] = [];
  let totalScore = 0;

  // 1. 与历史内容对比
  for (const history of historyContents) {
    const similarity = calculateTextSimilarity(content, history);
    if (similarity > 0.3) {
      totalScore += similarity * 30;
      similarParts.push(`与历史内容相似度: ${Math.round(similarity * 100)}%`);
    }
  }

  // 2. 检查是否使用了过度套路化的表达
  let templateCount = 0;
  for (const phrase of OVERUSED_PHRASES) {
    if (content.includes(phrase)) {
      templateCount++;
      similarParts.push(`使用了高频词汇: "${phrase}"`);
    }
  }

  if (templateCount > 3) {
    totalScore += templateCount * 5;
    suggestions.push("建议减少使用网红词汇，用更个人化的表达");
  }

  // 3. 检查标题是否太套路
  const firstLine = content.split("\n")[0];
  for (const template of COMMON_TEMPLATES) {
    const pattern = template.replace(/xxx/g, ".+?");
    if (new RegExp(pattern).test(firstLine)) {
      totalScore += 10;
      similarParts.push(`标题符合常见模板: "${template}"`);
      suggestions.push("建议让标题更有个人特色");
    }
  }

  // 4. 检查内容结构是否太模板化
  const structureScore = checkStructureOriginality(content);
  totalScore += (1 - structureScore) * 20;

  if (structureScore < 0.6) {
    suggestions.push("内容结构比较常见，尝试加入独特的个人经历或观点");
  }

  // 5. 提供个性化建议
  if (suggestions.length === 0 && totalScore < 30) {
    suggestions.push("内容独特性不错，继续保持个人风格！");
  }

  return {
    score: Math.min(100, Math.round(totalScore)),
    similarParts,
    suggestions,
    isUnique: totalScore < 40,
  };
}

function calculateTextSimilarity(text1: string, text2: string): number {
  // 使用简化的 Jaccard 相似度
  const words1 = new Set(extractKeywords(text1));
  const words2 = new Set(extractKeywords(text2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

function extractKeywords(text: string): string[] {
  // 提取2-4字的词组作为关键词
  const words: string[] = [];

  // 按标点分割
  const segments = text.split(/[，。！？、；：""''（）\s\n]/);

  for (const segment of segments) {
    if (segment.length >= 2 && segment.length <= 8) {
      words.push(segment);
    }
    // 提取2字词
    for (let i = 0; i < segment.length - 1; i++) {
      words.push(segment.slice(i, i + 2));
    }
  }

  return words;
}

function checkStructureOriginality(content: string): number {
  let score = 1;

  // 检查是否有固定的结构模式
  const lines = content.split("\n").filter((l) => l.trim());

  // 过于整齐的bullet points
  const bulletLines = lines.filter((l) => /^[\-\*•]\s/.test(l.trim()));
  if (bulletLines.length > 5 && bulletLines.length / lines.length > 0.6) {
    score -= 0.2;
  }

  // 过于整齐的数字列表
  const numberedLines = lines.filter((l) => /^\d+[\.、]/.test(l.trim()));
  if (numberedLines.length > 4) {
    score -= 0.15;
  }

  // 检查emoji使用是否太规律
  const emojiLines = lines.filter((l) =>
    /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u.test(l)
  );
  if (emojiLines.length === lines.length && lines.length > 3) {
    score -= 0.1; // 每行都有emoji太刻意
  }

  return Math.max(0, score);
}

export function generateUniqueTwist(content: string, persona: string): string[] {
  // 生成独特角度建议
  const suggestions: string[] = [];

  suggestions.push(`从${persona}的独特视角重新描述`);
  suggestions.push("加入一个具体的时间/地点细节");
  suggestions.push("分享一个只有你会遇到的特殊情况");
  suggestions.push("用一个意想不到的比喻来解释");
  suggestions.push("加入一个小失误或有趣的插曲");

  return suggestions;
}

// Rich history entry schema (P2-2)
export interface HistoryEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  timestamp: number;
  contentType?: string;
  wordCount?: number;
}

export function loadContentHistory(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const saved = localStorage.getItem("xhs-content-history");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Support both legacy string[] and new HistoryEntry[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === "string") {
          return parsed as string[];
        } else {
          return (parsed as HistoryEntry[]).map((e) => e.content);
        }
      }
    }
  } catch (e) {
    console.error("Failed to load content history:", e);
  }

  return [];
}

export function saveToContentHistory(content: string): void {
  if (typeof window === "undefined") return;

  try {
    const history = loadContentHistory();
    const updated = [content, ...history].slice(0, 20);
    localStorage.setItem("xhs-content-history", JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to save content history:", e);
  }
}

// Rich history functions (P2-2)
const RICH_HISTORY_KEY = "xhs-rich-history";

export function loadRichHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(RICH_HISTORY_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to load rich history:", e);
  }
  return [];
}

export function saveRichHistoryEntry(entry: Omit<HistoryEntry, "id" | "timestamp" | "wordCount">): void {
  if (typeof window === "undefined") return;
  try {
    const history = loadRichHistory();
    const newEntry: HistoryEntry = {
      ...entry,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      wordCount: entry.content.replace(/\s/g, "").length,
    };
    const updated = [newEntry, ...history].slice(0, 30);
    localStorage.setItem(RICH_HISTORY_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to save rich history:", e);
  }
}

export function deleteRichHistoryEntry(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const history = loadRichHistory();
    const updated = history.filter((e) => e.id !== id);
    localStorage.setItem(RICH_HISTORY_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to delete history entry:", e);
  }
}
