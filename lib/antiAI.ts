// AI味检测 & 去AI化处理

const AI_WORDS = [
  { ai: "首先", human: ["话说", "说起来", "先说"] },
  { ai: "其次", human: ["然后呢", "接着", "后来"] },
  { ai: "此外", human: ["对了", "还有啊", "顺便说"] },
  { ai: "总之", human: ["反正", "总而言之吧", "说白了"] },
  { ai: "综上所述", human: ["所以啊", "总的来说", "讲真"] },
  { ai: "因此", human: ["所以", "这样一来", "于是乎"] },
  { ai: "然而", human: ["但是吧", "不过呢", "结果"] },
  { ai: "值得注意的是", human: ["划重点", "注意啦", "这里要说一下"] },
  { ai: "需要指出的是", human: ["要说的是", "得提一嘴", "这里强调下"] },
  { ai: "总而言之", human: ["总之呢", "反正就是", "一句话"] },
  { ai: "进一步", human: ["再往下", "继续", "深入一点"] },
  { ai: "显而易见", human: ["很明显", "一看就知道", "谁都能看出"] },
  { ai: "毋庸置疑", human: ["肯定的", "绝对是", "没跑了"] },
  { ai: "在此基础上", human: ["基于这个", "接着", "然后"] },
  { ai: "与此同时", human: ["同时呢", "这时候", "一边"] },
];

const AI_PATTERNS = [
  /这是一个.{2,10}的过程/g,
  /具有重要意义/g,
  /发挥.{2,6}作用/g,
  /提供了.{2,10}的解决方案/g,
  /在.{2,10}方面/g,
  /通过.{2,10}的方式/g,
  /有效地.{2,10}/g,
  /显著.{2,6}了/g,
];

const SENTENCE_STARTERS = [
  "说实话", "讲真", "不得不说", "老实说", "话说",
  "哈哈", "笑死", "救命", "真的", "绝了",
  "突然发现", "刚刚", "今天", "昨天",
];

export interface AntiAIResult {
  score: number; // 0-100, 越高越像AI
  issues: string[];
  suggestions: string[];
}

export function detectAIFeatures(text: string): AntiAIResult {
  let score = 0;
  const issues: string[] = [];
  const suggestions: string[] = [];

  // 检测AI常用词
  for (const { ai } of AI_WORDS) {
    const regex = new RegExp(ai, "g");
    const matches = text.match(regex);
    if (matches) {
      score += matches.length * 5;
      issues.push(`使用了AI常用词"${ai}" (${matches.length}次)`);
    }
  }

  // 检测AI表达模式
  for (const pattern of AI_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      score += matches.length * 8;
      issues.push(`存在AI化表达模式`);
    }
  }

  // 检查句式整齐度(过于整齐像AI)
  const sentences = text.split(/[。！？]/);
  const lengths = sentences.map((s) => s.length).filter((l) => l > 0);
  if (lengths.length > 3) {
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lengths.length;
    if (variance < 50) {
      score += 15;
      issues.push("句子长度过于均匀，缺乏自然变化");
    }
  }

  // 检查是否缺少口语化表达
  const informalWords = ["哈哈", "笑死", "救命", "绝了", "太香了", "真的", "啊", "呢", "吧", "呀"];
  let informalCount = 0;
  for (const word of informalWords) {
    if (text.includes(word)) informalCount++;
  }
  if (informalCount < 2) {
    score += 10;
    suggestions.push("建议添加更多口语化表达");
  }

  // 检查emoji使用
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojis = text.match(emojiRegex);
  if (!emojis || emojis.length < 2) {
    score += 5;
    suggestions.push("适当添加emoji增加亲和力");
  }

  // 检查段落结构
  const paragraphs = text.split("\n\n").filter((p) => p.trim());
  if (paragraphs.length > 0) {
    const allStartSimilar = paragraphs.every((p) => /^[首其此]/.test(p.trim()));
    if (allStartSimilar && paragraphs.length > 2) {
      score += 20;
      issues.push("段落开头过于整齐，像列举式AI输出");
    }
  }

  score = Math.min(100, score);

  return { score, issues, suggestions };
}

export function deAIify(text: string): string {
  let result = text;

  // 替换AI常用词
  for (const { ai, human } of AI_WORDS) {
    const regex = new RegExp(ai, "g");
    result = result.replace(regex, () => {
      const randomIndex = Math.floor(Math.random() * human.length);
      return human[randomIndex];
    });
  }

  // 随机在句子开头添加口语化词汇
  const sentences = result.split(/([。！？])/);
  const processedSentences: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let sentence = sentences[i];

    // 每3-5个句子随机添加一个口语化开头
    if (i % 8 === 0 && sentence.length > 10 && Math.random() > 0.5) {
      const starter = SENTENCE_STARTERS[Math.floor(Math.random() * SENTENCE_STARTERS.length)];
      if (!sentence.trim().startsWith(starter)) {
        sentence = starter + "，" + sentence.trimStart();
      }
    }

    processedSentences.push(sentence);
  }

  result = processedSentences.join("");

  // 打乱过于整齐的排比句
  result = breakParallelStructure(result);

  return result;
}

function breakParallelStructure(text: string): string {
  // 如果有连续的相似结构句子，打乱它们
  const lines = text.split("\n");
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // 随机添加一些语气词
    if (line.length > 20 && Math.random() > 0.7) {
      const particles = ["啊", "呢", "吧", "呀", "哦"];
      const particle = particles[Math.floor(Math.random() * particles.length)];

      // 在句中适当位置添加语气词
      const insertPos = Math.floor(line.length * 0.6);
      const commaPos = line.indexOf("，", insertPos);
      if (commaPos > 0 && commaPos < line.length - 5) {
        line = line.slice(0, commaPos) + particle + line.slice(commaPos);
      }
    }

    processedLines.push(line);
  }

  return processedLines.join("\n");
}

export function injectHumanImperfections(text: string): string {
  let result = text;

  // 随机替换一些标点
  if (Math.random() > 0.7) {
    result = result.replace(/。/g, (match, offset) => {
      if (Math.random() > 0.8) return "～";
      return match;
    });
  }

  // 添加一些犹豫词
  const hesitations = ["emmm", "嗯...", "就是说", "怎么说呢"];
  if (Math.random() > 0.6) {
    const hesitation = hesitations[Math.floor(Math.random() * hesitations.length)];
    const sentences = result.split("。");
    if (sentences.length > 3) {
      const insertIndex = Math.floor(Math.random() * (sentences.length - 1)) + 1;
      sentences[insertIndex] = hesitation + "，" + sentences[insertIndex].trimStart();
      result = sentences.join("。");
    }
  }

  return result;
}
