// 个性化学习引擎

export interface UserProfile {
  id: string;
  persona: Persona;
  vocabulary: VocabularyPreference;
  editHistory: EditRecord[];
  styleMetrics: StyleMetrics;
  createdAt: number;
  updatedAt: number;
}

export interface Persona {
  positioning: "tech-newbie" | "senior-dev" | "slasher" | "student" | "custom";
  style: "cute" | "professional" | "humorous" | "casual";
  catchphrases: string[];
  signature: string;
  preferredEmojis: string[];
}

export interface VocabularyPreference {
  preferred: string[]; // 用户喜欢用的词
  avoided: string[]; // 用户不喜欢的词
  replacements: Record<string, string>; // 词汇替换映射
}

export interface EditRecord {
  timestamp: number;
  originalText: string;
  editedText: string;
  changeType: "deletion" | "replacement" | "addition";
}

export interface StyleMetrics {
  averageSentenceLength: number;
  emojiFrequency: number; // emoji per 100 chars
  exclamationFrequency: number;
  questionFrequency: number;
  informalWordRatio: number;
}

const DEFAULT_PERSONAS: Record<string, Partial<Persona>> = {
  "tech-newbie": {
    positioning: "tech-newbie",
    style: "cute",
    catchphrases: ["救命", "太难了", "终于搞定", "有没有姐妹", "求助"],
    preferredEmojis: ["😭", "🥺", "✨", "💪", "🙏"],
    signature: "小白也能学会的AI编程～",
  },
  "senior-dev": {
    positioning: "senior-dev",
    style: "professional",
    catchphrases: ["分享一下", "踩坑记录", "最佳实践", "架构思考"],
    preferredEmojis: ["💡", "🔧", "📝", "🎯", "⚡"],
    signature: "每天进步一点点",
  },
  slasher: {
    positioning: "slasher",
    style: "humorous",
    catchphrases: ["搞副业", "下班后", "斜杠青年", "变现", "效率"],
    preferredEmojis: ["🚀", "💰", "⏰", "🔥", "✅"],
    signature: "副业路上的打工人",
  },
  student: {
    positioning: "student",
    style: "casual",
    catchphrases: ["学习笔记", "期末复习", "课程作业", "实验报告"],
    preferredEmojis: ["📚", "✏️", "💻", "🎓", "📖"],
    signature: "码农预备役",
  },
};

export function createDefaultProfile(): UserProfile {
  return {
    id: generateId(),
    persona: {
      positioning: "tech-newbie",
      style: "casual",
      catchphrases: ["救命", "绝了", "太香了"],
      signature: "",
      preferredEmojis: ["✨", "💻", "🔥", "😭", "🎉"],
    },
    vocabulary: {
      preferred: [],
      avoided: [],
      replacements: {},
    },
    editHistory: [],
    styleMetrics: {
      averageSentenceLength: 20,
      emojiFrequency: 3,
      exclamationFrequency: 2,
      questionFrequency: 1,
      informalWordRatio: 0.1,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function loadProfile(): UserProfile {
  if (typeof window === "undefined") {
    return createDefaultProfile();
  }

  try {
    const saved = localStorage.getItem("xhs-user-profile");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to load profile:", e);
  }

  return createDefaultProfile();
}

export function saveProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;

  try {
    profile.updatedAt = Date.now();
    localStorage.setItem("xhs-user-profile", JSON.stringify(profile));
  } catch (e) {
    console.error("Failed to save profile:", e);
  }
}

export function recordEdit(
  profile: UserProfile,
  originalText: string,
  editedText: string
): UserProfile {
  const changeType = detectChangeType(originalText, editedText);

  const record: EditRecord = {
    timestamp: Date.now(),
    originalText,
    editedText,
    changeType,
  };

  // 学习用户的词汇偏好
  const updatedVocabulary = learnFromEdit(profile.vocabulary, originalText, editedText);

  // 更新风格指标
  const updatedMetrics = updateStyleMetrics(profile.styleMetrics, editedText);

  return {
    ...profile,
    editHistory: [...profile.editHistory.slice(-99), record], // 保留最近100条
    vocabulary: updatedVocabulary,
    styleMetrics: updatedMetrics,
    updatedAt: Date.now(),
  };
}

function detectChangeType(original: string, edited: string): EditRecord["changeType"] {
  if (edited.length < original.length * 0.7) {
    return "deletion";
  } else if (edited.length > original.length * 1.3) {
    return "addition";
  }
  return "replacement";
}

function learnFromEdit(
  current: VocabularyPreference,
  original: string,
  edited: string
): VocabularyPreference {
  const result = { ...current };

  // 找出被删除的词
  const originalWords = extractWords(original);
  const editedWords = extractWords(edited);

  const deletedWords = originalWords.filter((w) => !editedWords.includes(w));
  const addedWords = editedWords.filter((w) => !originalWords.includes(w));

  // 被删除的词加入避免列表
  for (const word of deletedWords) {
    if (word.length >= 2 && !result.avoided.includes(word)) {
      result.avoided = [...result.avoided, word].slice(-50);
    }
  }

  // 添加的词加入偏好列表
  for (const word of addedWords) {
    if (word.length >= 2 && !result.preferred.includes(word)) {
      result.preferred = [...result.preferred, word].slice(-50);
    }
  }

  return result;
}

function extractWords(text: string): string[] {
  // 简单的中文分词（按标点分割）
  return text
    .split(/[，。！？、；：""''（）\s\n]/)
    .filter((w) => w.length >= 2);
}

function updateStyleMetrics(current: StyleMetrics, text: string): StyleMetrics {
  const sentences = text.split(/[。！？]/).filter((s) => s.trim());
  const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / Math.max(1, sentences.length);

  const emojiCount = (text.match(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu) || []).length;
  const exclamationCount = (text.match(/！|!/g) || []).length;
  const questionCount = (text.match(/？|\?/g) || []).length;

  const informalWords = ["哈哈", "笑死", "救命", "绝了", "太香了", "真的", "吧", "呢", "啊"];
  let informalCount = 0;
  for (const word of informalWords) {
    informalCount += (text.match(new RegExp(word, "g")) || []).length;
  }

  // 指数移动平均更新
  const alpha = 0.3;
  return {
    averageSentenceLength: current.averageSentenceLength * (1 - alpha) + avgLength * alpha,
    emojiFrequency:
      current.emojiFrequency * (1 - alpha) + (emojiCount / text.length) * 100 * alpha,
    exclamationFrequency:
      current.exclamationFrequency * (1 - alpha) + exclamationCount * alpha,
    questionFrequency: current.questionFrequency * (1 - alpha) + questionCount * alpha,
    informalWordRatio:
      current.informalWordRatio * (1 - alpha) +
      (informalCount / Math.max(1, sentences.length)) * alpha,
  };
}

export function applyPersonalization(text: string, profile: UserProfile): string {
  let result = text;

  // 应用词汇替换
  for (const [from, to] of Object.entries(profile.vocabulary.replacements)) {
    result = result.replace(new RegExp(from, "g"), to);
  }

  // 避免用户不喜欢的词
  for (const avoided of profile.vocabulary.avoided) {
    if (result.includes(avoided) && profile.vocabulary.preferred.length > 0) {
      // 用用户偏好的词替换
      const replacement =
        profile.vocabulary.preferred[
          Math.floor(Math.random() * profile.vocabulary.preferred.length)
        ];
      result = result.replace(avoided, replacement);
    }
  }

  // 添加用户的签名（如果有）
  if (profile.persona.signature && !result.includes(profile.persona.signature)) {
    result = result.trim() + "\n\n" + profile.persona.signature;
  }

  return result;
}

export function getPersonaPreset(positioning: Persona["positioning"]): Partial<Persona> {
  return DEFAULT_PERSONAS[positioning] || DEFAULT_PERSONAS["tech-newbie"];
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}
