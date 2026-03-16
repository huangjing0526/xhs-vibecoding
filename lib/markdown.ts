import matter from "gray-matter";

export interface ParsedMarkdown {
  frontmatter: {
    title?: string;
    tags?: string[];
    mood?: string;
    date?: string;
    [key: string]: unknown;
  };
  content: string;
  sections: Section[];
  codeBlocks: CodeBlock[];
  keyPoints: string[];
  emotionWords: EmotionWord[];
}

export interface Section {
  level: number;
  title: string;
  content: string;
}

export interface CodeBlock {
  language: string;
  code: string;
}

export interface EmotionWord {
  word: string;
  emotion: "frustration" | "achievement" | "excitement" | "curiosity" | "struggle";
  context: string;
}

const EMOTION_PATTERNS: Record<string, { emotion: EmotionWord["emotion"]; words: string[] }> = {
  frustration: {
    emotion: "frustration",
    words: ["踩坑", "崩溃", "报错", "失败", "卡住", "头疼", "折腾", "心累", "绝望", "懵逼", "坑", "bug", "问题"],
  },
  achievement: {
    emotion: "achievement",
    words: ["搞定", "成功", "完成", "解决", "实现", "终于", "跑通", "搞出来", "做出来", "弄好"],
  },
  excitement: {
    emotion: "excitement",
    words: ["太香了", "绝了", "爱了", "惊艳", "惊喜", "厉害", "牛", "神器", "好用", "强大", "amazing", "wow"],
  },
  curiosity: {
    emotion: "curiosity",
    words: ["尝试", "探索", "研究", "学习", "发现", "想法", "思考", "好奇"],
  },
  struggle: {
    emotion: "struggle",
    words: ["挣扎", "纠结", "反复", "调试", "尝试", "试了", "换了", "改了"],
  },
};

export function parseMarkdown(rawContent: string): ParsedMarkdown {
  const { data: frontmatter, content } = matter(rawContent);

  const sections = extractSections(content);
  const codeBlocks = extractCodeBlocks(content);
  const keyPoints = extractKeyPoints(content);
  const emotionWords = extractEmotionWords(content);

  return {
    frontmatter: frontmatter as ParsedMarkdown["frontmatter"],
    content,
    sections,
    codeBlocks,
    keyPoints,
    emotionWords,
  };
}

function extractSections(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split("\n");
  let currentSection: Section | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      if (currentSection) {
        currentSection.content = currentContent.join("\n").trim();
        sections.push(currentSection);
      }

      currentSection = {
        level: headerMatch[1].length,
        title: headerMatch[2],
        content: "",
      };
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  if (currentSection) {
    currentSection.content = currentContent.join("\n").trim();
    sections.push(currentSection);
  }

  return sections;
}

function extractCodeBlocks(content: string): CodeBlock[] {
  const codeBlocks: CodeBlock[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    codeBlocks.push({
      language: match[1] || "text",
      code: match[2].trim(),
    });
  }

  return codeBlocks;
}

function extractKeyPoints(content: string): string[] {
  const keyPoints: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const bulletMatch = line.match(/^[\-\*]\s+(.+)$/);
    if (bulletMatch) {
      keyPoints.push(bulletMatch[1].trim());
    }

    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      keyPoints.push(numberedMatch[1].trim());
    }
  }

  return keyPoints;
}

function extractEmotionWords(content: string): EmotionWord[] {
  const emotionWords: EmotionWord[] = [];
  const contentLower = content.toLowerCase();

  for (const [, pattern] of Object.entries(EMOTION_PATTERNS)) {
    for (const word of pattern.words) {
      const wordLower = word.toLowerCase();
      let index = contentLower.indexOf(wordLower);

      while (index !== -1) {
        const start = Math.max(0, index - 20);
        const end = Math.min(content.length, index + word.length + 20);
        const context = content.slice(start, end);

        emotionWords.push({
          word,
          emotion: pattern.emotion,
          context,
        });

        index = contentLower.indexOf(wordLower, index + 1);
      }
    }
  }

  return emotionWords;
}

export function extractTitle(parsed: ParsedMarkdown): string {
  if (parsed.frontmatter.title) {
    return parsed.frontmatter.title;
  }

  if (parsed.sections.length > 0) {
    return parsed.sections[0].title;
  }

  const firstLine = parsed.content.split("\n")[0];
  return firstLine.replace(/^#+\s*/, "").slice(0, 50);
}

export function extractMood(parsed: ParsedMarkdown): string {
  if (parsed.frontmatter.mood) {
    return parsed.frontmatter.mood;
  }

  const emotionCounts: Record<string, number> = {};
  for (const ew of parsed.emotionWords) {
    emotionCounts[ew.emotion] = (emotionCounts[ew.emotion] || 0) + 1;
  }

  let dominantEmotion = "neutral";
  let maxCount = 0;
  for (const [emotion, count] of Object.entries(emotionCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantEmotion = emotion;
    }
  }

  return dominantEmotion;
}
