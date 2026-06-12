export interface BloggerProfile {
  id: string;
  name: string;
  platform: string;
  homepageUrl?: string;
  positioning: string;
  status: string;
}

export interface BloggerSample {
  id: string;
  bloggerId: string;
  title: string;
  content: string;
  tags: string[];
  coverDescription?: string;
  metrics?: {
    views?: number;
    likes?: number;
    saves?: number;
    comments?: number;
    shares?: number;
  };
}

export interface BloggerDistillation {
  id: string;
  bloggerId: string;
  coreDao: string;
  topicDao: string[];
  titlePatterns: string[];
  contentPatterns: string[];
  visualPatterns: string[];
  toneRules: string[];
  boundaries: string[];
  adaptationNotes: string[];
}

export const DEMO_BLOGGER_PROFILES: BloggerProfile[] = [
  {
    id: "blogger-xiao-a",
    name: "小A学财经",
    platform: "小红书",
    homepageUrl: "https://www.xiaohongshu.com/",
    positioning: "把复杂认知讲成读者能照见自己的真实处境",
    status: "已蒸馏",
  },
  {
    id: "blogger-kazike",
    name: "数字生命卡兹克",
    platform: "小红书",
    positioning: "主流 AI 工具 + 保姆级动作 + 强即时情绪",
    status: "样本充足",
  },
  {
    id: "blogger-sunyao",
    name: "孙耀说家具",
    platform: "小红书",
    positioning: "具体场景里的反差和够得着的奇观",
    status: "待复核",
  },
];

export const DEMO_BLOGGER_SAMPLES: BloggerSample[] = [
  {
    id: "sample-001",
    bloggerId: "blogger-xiao-a",
    title: "我终于明白，普通人学 AI 最怕的不是工具太多",
    content: "真正卡住的，是不知道自己处在哪个使用阶段。先把问题说清楚，再选工具，动作会稳很多。",
    tags: ["#AI工具", "#普通人学AI"],
    coverDescription: "白底大字，标题强调普通人的真实困惑",
    metrics: { views: 48000, likes: 2600, saves: 4100, comments: 188 },
  },
  {
    id: "sample-002",
    bloggerId: "blogger-xiao-a",
    title: "别急着收藏 Prompt，先看你是不是这种人",
    content: "同一套 Prompt 对不同处境的人效果完全不同。先判断任务类型，再决定要不要套模板。",
    tags: ["#Prompt", "#AI学习"],
    coverDescription: "反差标题 + 极简清单",
    metrics: { views: 36000, likes: 1900, saves: 2800, comments: 132 },
  },
  {
    id: "sample-003",
    bloggerId: "blogger-kazike",
    title: "Claude 这套用法，适合每天写方案的人",
    content: "给它角色、输入、验收口径，再让它反问缺口。比直接让 AI 写方案更稳。",
    tags: ["#Claude", "#AI办公"],
    coverDescription: "工具名 + 可照做步骤",
    metrics: { views: 92000, likes: 6100, saves: 8800, comments: 420 },
  },
];

export const DEMO_BLOGGER_DISTILLATIONS: BloggerDistillation[] = [
  {
    id: "distill-xiao-a",
    bloggerId: "blogger-xiao-a",
    coreDao: "让读者在内容里照见自己的处境，而不是只获得一条知识。",
    topicDao: [
      "从读者真实困惑进入，不从工具功能进入。",
      "同一件事要区分不同人群的适用边界。",
      "能让读者判断“我是不是这种情况”的选题更容易被收藏。",
    ],
    titlePatterns: [
      "我终于明白，X 最怕的不是 Y",
      "别急着 X，先看你是不是这种人",
      "真正卡住你的，不是 X，而是 Y",
    ],
    contentPatterns: [
      "先描述读者处境，再给判断标准。",
      "少讲结论，多给读者自查问题。",
      "结尾给一个可复用判断框架。",
    ],
    visualPatterns: [
      "白底大字，信息少但判断强。",
      "封面突出冲突词，不堆满步骤。",
      "正文配图适合做自查清单。",
    ],
    toneRules: [
      "像朋友复盘，不像老师训话。",
      "少用夸张结果，多用具体处境。",
      "保持克制，不做私域引导。",
    ],
    boundaries: [
      "不能照搬博主标题原句。",
      "不能把当前账号包装成财经号。",
      "不能编造收益、效率提升或人群规模。",
    ],
    adaptationNotes: [
      "迁移到 AI Coding 账号时，要把“处境”换成开发协作、选题、Prompt、代码审查等真实场景。",
      "标题可借反差结构，但案例必须来自当前素材。",
    ],
  },
];

function sampleText(samples: BloggerSample[]): string {
  return samples
    .map((sample) => `${sample.title} ${sample.content} ${sample.coverDescription || ""}`)
    .join(" ");
}

export function createFallbackBloggerDistillation(
  profile: BloggerProfile,
  samples: BloggerSample[]
): BloggerDistillation {
  const text = sampleText(samples);
  const hasTool = /Claude|ChatGPT|AI|Prompt|工具/.test(text);
  const hasReflection = /明白|不是|真正|处境|判断/.test(text);

  return {
    id: `distill-${profile.id}-${Date.now().toString(36)}`,
    bloggerId: profile.id,
    coreDao: hasReflection
      ? "先让读者照见自己的真实处境，再给出可判断、可照做的方法。"
      : "把高表现内容拆成具体场景、冲突判断和可复用动作。",
    topicDao: [
      hasTool ? "围绕主流 AI 工具和真实使用任务，不做冷门炫技。" : "优先选择读者能代入的具体场景。",
      "每个选题都要回答读者为什么现在要点开。",
      "把个人经验抽成一个可收藏的判断表、清单或步骤。",
    ],
    titlePatterns: [
      "别急着做 X，先判断你是不是 Y",
      "真正卡住你的不是 X，而是 Y",
      "我用 X 复盘后，发现问题在 Y",
    ],
    contentPatterns: [
      "开头 3 行先讲痛点或反差。",
      "中段用真实案例解释为什么会卡住。",
      "结尾给读者能直接收藏的结构化资产。",
    ],
    visualPatterns: [
      "封面只保留 1 个冲突观点和 1 个关键词。",
      "内容配图优先做清单、流程或对比。",
      "视频首屏先给反差，不先讲背景。",
    ],
    toneRules: [
      "口吻像真实复盘，避免培训号语气。",
      "不承诺夸张结果，不制造焦虑。",
      "少用感叹号和煽动式反问。",
    ],
    boundaries: [
      "不复制博主原句、固定人设或私域话术。",
      "不编造素材里没有的数据和收益。",
      "不把当前账号包装成不相关领域。",
    ],
    adaptationNotes: [
      "迁移到当前账号时，用 AI Coding 的真实素材替换博主案例。",
      "借判断路径，不借具体皮肤和口头禅。",
    ],
  };
}

export function getSamplesForBlogger(bloggerId: string): BloggerSample[] {
  return DEMO_BLOGGER_SAMPLES.filter((sample) => sample.bloggerId === bloggerId);
}

export function getDistillationForBlogger(bloggerId: string): BloggerDistillation | null {
  return DEMO_BLOGGER_DISTILLATIONS.find((item) => item.bloggerId === bloggerId) || null;
}
