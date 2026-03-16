// 情绪识别 & 共鸣增强引擎

import { EmotionWord } from "./markdown";

export interface EmotionArc {
  stages: EmotionStage[];
  dominantEmotion: string;
  narrativeHook: string;
}

export interface EmotionStage {
  emotion: string;
  intensity: number; // 1-10
  description: string;
  suggestedEmoji: string[];
}

const EMOTION_EMOJIS: Record<string, string[]> = {
  frustration: ["😫", "😩", "🤯", "💢", "😤", "🫠"],
  achievement: ["🎉", "✨", "🙌", "💪", "🚀", "⭐"],
  excitement: ["😍", "🔥", "💖", "✨", "🤩", "💫"],
  curiosity: ["🤔", "💡", "👀", "🧐", "❓", "🔍"],
  struggle: ["😅", "🥲", "😮‍💨", "🫣", "😬", "💦"],
  neutral: ["📝", "💻", "🖥️", "⌨️", "📱", "🎯"],
};

const NARRATIVE_HOOKS: Record<string, string[]> = {
  frustration: [
    "踩坑预警！这个问题让我崩溃了...",
    "救命，我以为这次要翻车了",
    "差点没把我逼疯的一个bug",
  ],
  achievement: [
    "终于搞定了！分享一下我的心路历程",
    "成就感拉满！这个功能终于实现了",
    "太爽了！困扰我一周的问题解决了",
  ],
  excitement: [
    "发现了一个神器，必须分享给大家！",
    "这个工具也太香了吧！",
    "震惊！原来还能这样做",
  ],
  curiosity: [
    "今天探索了一个有趣的方向",
    "突然好奇：如果这样做会怎样？",
    "带着疑问开始了今天的coding",
  ],
  struggle: [
    "反复调试的一天，最后的结果让我惊喜",
    "经历了N次失败，终于找到了正确的方向",
    "从懵逼到顿悟的过程",
  ],
  neutral: [
    "今日coding记录",
    "又是充实的一天",
    "分享一下今天的开发心得",
  ],
};

export function analyzeEmotionArc(emotionWords: EmotionWord[]): EmotionArc {
  if (emotionWords.length === 0) {
    return {
      stages: [
        {
          emotion: "neutral",
          intensity: 5,
          description: "平稳的coding体验",
          suggestedEmoji: EMOTION_EMOJIS.neutral,
        },
      ],
      dominantEmotion: "neutral",
      narrativeHook: NARRATIVE_HOOKS.neutral[0],
    };
  }

  // 按出现顺序分组情绪
  const emotionGroups: Map<string, number> = new Map();
  for (const ew of emotionWords) {
    emotionGroups.set(ew.emotion, (emotionGroups.get(ew.emotion) || 0) + 1);
  }

  // 找出主导情绪
  let dominantEmotion = "neutral";
  let maxCount = 0;
  for (const [emotion, count] of emotionGroups.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominantEmotion = emotion;
    }
  }

  // 构建情绪弧线
  const stages: EmotionStage[] = [];
  const uniqueEmotions = Array.from(new Set(emotionWords.map((ew) => ew.emotion)));

  for (const emotion of uniqueEmotions) {
    const count = emotionGroups.get(emotion) || 1;
    const intensity = Math.min(10, count * 2 + 3);

    stages.push({
      emotion,
      intensity,
      description: getEmotionDescription(emotion, intensity),
      suggestedEmoji: EMOTION_EMOJIS[emotion] || EMOTION_EMOJIS.neutral,
    });
  }

  // 选择叙事钩子
  const hooks = NARRATIVE_HOOKS[dominantEmotion] || NARRATIVE_HOOKS.neutral;
  const narrativeHook = hooks[Math.floor(Math.random() * hooks.length)];

  return {
    stages,
    dominantEmotion,
    narrativeHook,
  };
}

function getEmotionDescription(emotion: string, intensity: number): string {
  const descriptions: Record<string, Record<string, string>> = {
    frustration: {
      low: "遇到了一些小问题",
      medium: "被bug折腾了一番",
      high: "差点崩溃的debug经历",
    },
    achievement: {
      low: "顺利完成了任务",
      medium: "成功解决了问题，很有成就感",
      high: "超级满足！重大突破！",
    },
    excitement: {
      low: "发现了一些有趣的东西",
      medium: "被这个工具/方法惊艳到了",
      high: "太震撼了！必须分享！",
    },
    curiosity: {
      low: "有了一些新想法",
      medium: "深入研究了某个方向",
      high: "沉浸式探索，停不下来",
    },
    struggle: {
      low: "经历了一些波折",
      medium: "反复尝试，终于找到方向",
      high: "从迷茫到清晰的蜕变",
    },
  };

  const level = intensity <= 3 ? "low" : intensity <= 6 ? "medium" : "high";
  return descriptions[emotion]?.[level] || "coding进行中";
}

export function amplifyEmotion(content: string, arc: EmotionArc): string {
  let result = content;

  // 根据情绪弧线添加相应的emoji
  const mainEmoji = arc.stages[0]?.suggestedEmoji[0] || "💻";

  // 在关键情绪词后添加emoji
  const emotionWordMap: Record<string, string> = {
    踩坑: "😫",
    崩溃: "🤯",
    搞定: "✨",
    成功: "🎉",
    太香了: "😍",
    绝了: "🔥",
    救命: "😱",
    终于: "🙌",
  };

  for (const [word, emoji] of Object.entries(emotionWordMap)) {
    if (result.includes(word) && !result.includes(word + emoji)) {
      result = result.replace(new RegExp(word, "g"), word + emoji);
    }
  }

  return result;
}

export function generateEmotionTransition(arc: EmotionArc): string {
  if (arc.stages.length <= 1) {
    return "";
  }

  const transitions: string[] = [];

  for (let i = 0; i < arc.stages.length - 1; i++) {
    const from = arc.stages[i];
    const to = arc.stages[i + 1];

    if (from.emotion === "frustration" && to.emotion === "achievement") {
      transitions.push("从崩溃到狂喜");
    } else if (from.emotion === "curiosity" && to.emotion === "excitement") {
      transitions.push("从好奇到惊艳");
    } else if (from.emotion === "struggle" && to.emotion === "achievement") {
      transitions.push("从挣扎到突破");
    }
  }

  return transitions.join("，");
}
