// AI 内容生成核心库 - canonical prompt 构建

import { ParsedMarkdown, extractTitle, extractMood } from "./markdown";
import { analyzeEmotionArc } from "./emotionEngine";
import { UserProfile } from "./personalization";

// ─── 内容类型系统 ──────────────────────────────────────────────────────────────

export type ContentType =
  | "vibecoding"     // AI编程/技术分享
  | "store-visit"    // 探店
  | "product-review" // 产品测评
  | "study-notes"    // 学习干货
  | "lifestyle"      // 生活vlog
  | "emotion-story"; // 情感故事

export interface ContentTypeConfig {
  label: string;
  icon: string;
  description: string;
  structureTemplate: string;
  hookFormulas: string;
  tagSeeds: string[];
  emojiHints: string;
}

export const CONTENT_TYPE_CONFIGS: Record<ContentType, ContentTypeConfig> = {
  vibecoding: {
    label: "AI编程",
    icon: "💻",
    description: "振动编程/技术分享",
    structureTemplate: `开头钩子：1句话抓住注意力 + 1-2个emoji
背景铺垫：为什么做这个/遇到什么问题（口语化）
过程分享：
- 用了什么工具
- 踩了什么坑
- 怎么解决的
成果展示：最终效果
个人感悟：1-2句真实感受
互动引导：提问/求赞/求关注`,
    hookFormulas: `- 数字法：「Day X | 3分钟搞定xxx」
- 反差法：「不会代码的我，竟然做出了xxx」
- 悬念法：「这个AI工具让我直接惊了...」
- 共鸣法：「打工人必看！xxx」
- 否定法：「别再手写代码了！」`,
    tagSeeds: ["#vibecoding", "#AI编程", "#程序员日常", "#效率工具", "#自动化"],
    emojiHints: "技术类常用：💻🔧⚡✅🚀🤯💡",
  },
  "store-visit": {
    label: "探店",
    icon: "🍜",
    description: "美食探店/打卡分享",
    structureTemplate: `开头感受钩子：直接说出最强烈的感受（「这家店我要来第100次」）
地址+交通：具体位置，交通方式（📍）
环境颜值：氛围、装修风格（调动视觉感受）
必点推荐：3-5道菜/饮品，带价格，用口感词描述
避坑提示：排队情况/停车/不推荐的菜
总评分：X/10，一句话总结
互动引导：求朋友推荐同类宝藏店`,
    hookFormulas: `- 反差法：「人均XX元，吃出了三倍的价值感」
- 数字法：「这家店去了5次，终于打完所有菜卡」
- 悬念法：「这家隐藏在小巷里的店，本地人都不说」
- 共鸣法：「减肥期间破戒，全因这一口！」
- 否定法：「别再踩雷了！这才是好吃的标准」`,
    tagSeeds: ["#探店", "#美食推荐", "#宝藏餐厅", "#打卡", "#吃货日记", "#探店vlog"],
    emojiHints: "探店常用：🍜🍕😋📍🔥⭐💕🥹😍",
  },
  "product-review": {
    label: "产品测评",
    icon: "🛍️",
    description: "好物测评/种草拔草",
    structureTemplate: `入坑原因：为什么买这个（解决什么问题/被谁种草）
开箱颜值：外观、包装的第一印象
实测体验：日常使用感受，具体场景细节
优点清单：2-3个最亮眼的优点
缺点实说：1-2个小遗憾（真实感强）
适合人群：推荐给谁，不适合谁
购买信息：在哪买的，价格透明`,
    hookFormulas: `- 避坑预警：「买了XX款同类，只有这款让我复购」
- 数据对比：「用了30天，皮肤真的有变化？」
- 反差法：「XX元平替，打败了我的大牌」
- 否定法：「别踩坑！这类产品买前必看」
- 共鸣法：「敏感肌姐妹看过来，终于找到了」`,
    tagSeeds: ["#好物推荐", "#产品测评", "#实测", "#平替", "#种草", "#好用到哭"],
    emojiHints: "测评常用：🛍️✨💄🧴⭐💯🔥💕",
  },
  "study-notes": {
    label: "学习干货",
    icon: "📚",
    description: "学习笔记/知识分享",
    structureTemplate: `为什么学这个：个人动机，1-2句引发共鸣
核心干货：3-5个关键知识点，每点1-2句话
我的理解：加入个人思考/类比，不要照抄教材
容易犯的错误：防坑指南（来自真实经历）
推荐资源：书/课程/工具（具体说好在哪）
互动引导：问读者有没有相同困惑`,
    hookFormulas: `- 数字干货法：「3个知识点，彻底搞懂XX」
- 反认知法：「我之前对XX的理解完全错了」
- 效率法：「自学XX，用了这个方法快3倍」
- 共鸣法：「考试/工作遇到XX难题，这样解决」
- 结果先行：「学完这5点，XX水平直接提升」`,
    tagSeeds: ["#学习笔记", "#干货", "#自学", "#知识分享", "#学习方法", "#考研"],
    emojiHints: "学习类常用：📚✏️💡🧠📝⭐🔥💪",
  },
  lifestyle: {
    label: "生活vlog",
    icon: "🌸",
    description: "日常生活/氛围分享",
    structureTemplate: `场景设定：今天在哪/在做什么（具体时间地点）
氛围描述：光线、音乐、感受（调动感官）
行动流水：按时间线分享今天做的3-4件事
小确幸细节：1-2个让你开心的小瞬间（越具体越好）
今日感悟：一句话总结心情或想法
互动：问读者最近状态如何`,
    hookFormulas: `- 时间法：「周日下午4点，一个人在家的状态」
- 氛围法：「下雨天，窗边一杯咖啡，很治愈」
- 反差法：「本来很丧，结果做了这件事治好了」
- 共鸣法：「一个人生活的第X年，越来越会了」
- 悬念法：「最近一个小改变，整个状态都好了」`,
    tagSeeds: ["#日常vlog", "#生活记录", "#一个人生活", "#治愈日常", "#慢生活"],
    emojiHints: "生活类常用：🌸☕🌿🕯️🌙✨💫🍃",
  },
  "emotion-story": {
    label: "情感故事",
    icon: "💝",
    description: "情感经历/心路历程",
    structureTemplate: `场景代入：用细节描述一个具体瞬间（让读者身临其境）
冲突/困境：说清楚遇到了什么（情感化表达，不要讲道理）
内心挣扎：真实的心理活动（这是最重要的部分）
转折时刻：什么事/人/话改变了你
成长感悟：学到了什么，真诚表达，不说教
互动引导：问读者有没有类似经历`,
    hookFormulas: `- 场景开场：「那天下午，我突然哭了出来」
- 数字共鸣：「一个人在外漂了X年，最难的不是...」
- 反差法：「以为会很难过，结果发现自己长大了」
- 设问法：「你有没有那种想消失一会儿的感觉？」
- 结果先行：「这件事让我用了两年才想通」`,
    tagSeeds: ["#情感故事", "#成长", "#心路历程", "#真实经历", "#治愈"],
    emojiHints: "情感类常用：💝🥹😭💪🌈✨🫂💕",
  },
};

// ─── 病毒力评分 ─────────────────────────────────────────────────────────────

export function calculateViralityScore(title: string): {
  score: number;
  signals: string[];
} {
  let score = 50;
  const signals: string[] = [];
  const len = title.length;

  if (/\d+/.test(title)) {
    score += 15;
    signals.push("+15 含数字");
  }

  const emotionTriggers = ["救命", "惊了", "绝了", "崩溃", "终于", "没想到", "离谱", "太香了", "震惊", "直接惊了"];
  if (emotionTriggers.some((w) => title.includes(w))) {
    score += 12;
    signals.push("+12 情绪触发词");
  }

  const audienceWords = ["打工人", "姐妹", "小白", "程序员", "宝妈", "学生党", "上班族", "社畜"];
  if (audienceWords.some((w) => title.includes(w))) {
    score += 10;
    signals.push("+10 人群定位");
  }

  if (len >= 15 && len <= 25) {
    score += 8;
    signals.push("+8 标题长度最优");
  } else if (len < 10 || len > 35) {
    score -= 10;
    signals.push("-10 标题过短/过长");
  }

  if (title.includes("？") || title.includes("?")) {
    score += 8;
    signals.push("+8 含疑问句");
  }

  const contrastWords = ["别再", "不要", "没想到", "竟然", "其实", "原来", "不会"];
  if (contrastWords.some((w) => title.includes(w))) {
    score += 12;
    signals.push("+12 反差/颠覆认知");
  }

  if (title.endsWith("！") || title.endsWith("...")) {
    score += 5;
    signals.push("+5 结尾有力");
  }

  const clicheWords = ["宝藏", "yyds", "绝绝子", "YYDS", "太好了吧", "必看必看"];
  if (clicheWords.some((w) => title.toLowerCase().includes(w.toLowerCase()))) {
    score -= 8;
    signals.push("-8 含滥用词");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    signals: signals.slice(0, 3),
  };
}

// ─── 主 Prompt 构建（canonical） ────────────────────────────────────────────

export function buildPrompt(
  parsed: ParsedMarkdown,
  profile: UserProfile,
  contentType: ContentType = "vibecoding"
): string {
  const title = extractTitle(parsed);
  const mood = extractMood(parsed);
  const config = CONTENT_TYPE_CONFIGS[contentType];

  // 激活情绪引擎
  const emotionArc = analyzeEmotionArc(parsed.emotionWords);

  const personaContext = `用户人设：${profile.persona.positioning}
风格偏好：${profile.persona.style}
常用口头禅：${profile.persona.catchphrases.join("、")}
偏好emoji：${profile.persona.preferredEmojis.join("")}
${profile.persona.signature ? `签名：${profile.persona.signature}` : ""}`;

  const hasEmotion =
    emotionArc.dominantEmotion !== "neutral" && emotionArc.stages.length > 0;
  const emotionGuidance = hasEmotion
    ? `
【情绪共鸣引导】
主导情绪：${emotionArc.dominantEmotion}
情绪弧线：${emotionArc.stages.map((s) => `${s.emotion}(强度${s.intensity})`).join(" → ")}
建议开头参考：「${emotionArc.narrativeHook}」
推荐emoji：${emotionArc.stages.flatMap((s) => s.suggestedEmoji).slice(0, 6).join("")}

请放大情绪起伏，让读者感受到真实体验，制造有代入感的叙事弧线。`
    : "";

  return `你是一个小红书内容创作专家，擅长将内容转化为有温度、有共鸣的爆款笔记。
当前内容类型：${config.label}（${config.description}）

【用户人设】
${personaContext}

【原始内容】
标题：${title}
情绪基调：${mood}
${parsed.content}

【提取的要点】
${parsed.keyPoints.map((p) => `- ${p}`).join("\n")}

【标题钩子公式】选择最适合"${config.label}"的：
${config.hookFormulas}

【${config.label}的文案结构】
${config.structureTemplate}

【emoji使用提示】
${config.emojiHints}

【去AI化规则 - 非常重要】
1. 使用口语化表达：「搞定」「绝了」「真的绝」「笑死」「救命」
2. 加入语气词：「哈哈哈」「啊啊啊」「真的吗」
3. 适度不完美：允许小吐槽、自嘲
4. 人称代入：多用「我」「咱」
5. 禁止使用：「首先」「其次」「总之」「综上」「此外」「值得注意的是」「需要指出的是」
6. 句式变化：长短句交替，避免整齐排比
7. 真实细节：加入具体时间、场景描述
8. emoji自然穿插：不堆砌，1-2句一个
9. 避免过于完美的逻辑递进
10. 不要用书面语，要像在跟朋友聊天
${emotionGuidance}

【标签策略】
基础标签参考：${config.tagSeeds.join(" ")}
请混搭大流量标签（>100万）和精准小标签（<10万），共5-8个

【任务】
1. 生成3个不同风格的标题（返回为titleVariants数组）
2. 生成小红书正文（400字左右）
3. 推荐5-8个话题标签
4. 生成一条评论区预埋（引导互动）

【输出格式】严格按照JSON格式返回：
{
  "title": "推荐的最佳标题",
  "titleVariants": ["标题1", "标题2", "标题3"],
  "content": "正文内容...",
  "tags": ["#标签1", "#标签2"],
  "firstComment": "评论区预埋内容"
}

注意：
- 正文不要包含标题
- emoji要自然融入，不要堆砌
- 语气要像在跟朋友分享
- 字数控制在350到450字之间

⚠️ 重要：只输出纯 JSON，不要加任何解释、markdown代码块或前缀文字。第一个字符必须是 {，最后一个字符必须是 }。
`;
}

// ─── 分段 Prompt（供局部重生成使用）────────────────────────────────────────

export function buildTitleOnlyPrompt(
  parsed: ParsedMarkdown,
  profile: UserProfile,
  contentType: ContentType,
  existingBody: string
): string {
  const config = CONTENT_TYPE_CONFIGS[contentType];
  const title = extractTitle(parsed);
  return `你是小红书标题专家。请基于以下正文内容，重新生成3个不同风格的爆款标题。

【内容类型】${config.label}
【原始标题参考】${title}
【正文内容】
${existingBody}

【标题公式参考】
${config.hookFormulas}

【要求】
- 3个标题风格各不相同
- 口语化，有冲击力
- 长度15-25字为最佳

⚠️ 只输出纯JSON，不加任何解释或代码块。格式：
{"title": "最佳标题", "titleVariants": ["标题1", "标题2", "标题3"]}`;
}

export function buildBodyOnlyPrompt(
  parsed: ParsedMarkdown,
  profile: UserProfile,
  contentType: ContentType,
  selectedTitle: string
): string {
  const config = CONTENT_TYPE_CONFIGS[contentType];
  return `你是小红书正文写作专家。请基于以下信息重新写一版正文，风格要有所不同。

【内容类型】${config.label}
【选定标题】${selectedTitle}
【原始内容】${parsed.content}
【用户人设】${profile.persona.positioning}，风格偏好：${profile.persona.style}

【文案结构】
${config.structureTemplate}

【去AI化要求】
- 口语化，像跟朋友聊天
- 禁止：首先/其次/总之/综上/此外
- 长短句交替，emoji自然穿插
- 字数350-450字

⚠️ 只输出纯JSON，不加任何解释或代码块。格式：
{"content": "正文内容..."}`;
}

export function buildTagsOnlyPrompt(
  contentType: ContentType,
  title: string,
  body: string
): string {
  const config = CONTENT_TYPE_CONFIGS[contentType];
  return `你是小红书话题标签专家。请基于以下内容，推荐5-8个最合适的话题标签。

【内容类型】${config.label}
【标题】${title}
【正文摘要】${body.slice(0, 200)}
【基础标签参考】${config.tagSeeds.join(" ")}

【策略】混搭大流量标签（>100万）和精准小标签（<10万）

⚠️ 只输出纯JSON，不加任何解释或代码块。格式：
{"tags": ["#标签1", "#标签2", "#标签3"]}`;
}

export function buildRefinePrompt(
  section: "content" | "title" | "comment",
  currentContent: string,
  instruction: string
): string {
  const sectionMap = {
    content: "小红书正文",
    title: "小红书标题",
    comment: "评论区预埋文案",
  };
  const outputKey = section === "title" ? "title" : section === "comment" ? "firstComment" : "content";

  return `你是小红书内容优化专家。请根据用户的指令，对以下内容进行修改。

【修改对象】${sectionMap[section]}
【当前内容】
${currentContent}

【用户指令】${instruction}

【要求】
- 保持原有的核心信息和结构
- 只按用户指令调整风格/语气/表达
- 口语化，不要书面语
- 修改后字数变化不超过50字

⚠️ 只输出纯JSON，不加任何解释或代码块。格式：
{"${outputKey}": "修改后的内容"}`;
}

// ─── 发布时间建议（保持不变）────────────────────────────────────────────────

export function getPublishTimeHint(): { best: string[]; reason: string } {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  const isWeekend = day === 0 || day === 6;

  if (isWeekend) {
    return {
      best: ["10:00-12:00", "15:00-17:00", "20:00-22:00"],
      reason: "周末用户活跃时间更分散，上午和下午都是好时机",
    };
  }

  if (hour < 12) {
    return {
      best: ["12:00-14:00", "18:00-20:00", "21:00-23:00"],
      reason: "工作日午休和晚间是黄金发布时段",
    };
  }

  if (hour < 18) {
    return {
      best: ["18:00-20:00", "21:00-23:00"],
      reason: "下班后到睡前是用户最活跃的时段",
    };
  }

  return {
    best: ["现在发布！", "21:00-23:00"],
    reason: "晚间是当天最佳发布时机，抓紧时间！",
  };
}
