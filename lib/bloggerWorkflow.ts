import type { AreaId } from "@/lib/capabilities";
import { DAOKU_PANBIELI } from "@/lib/daoku";

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

/**
 * 复刻一条道库要你自己补的东西。道给判断路径，槽位说清拿什么填。
 * 没有槽位的蒸馏结果只是「别人怎么做的」，不是模板——这条由类型把守，字段必填。
 */
export interface DaokuSlot {
  id: string;
  label: string;
  /** 一句话说清要补什么，卡片和空态都用它 */
  hint: string;
  /** 去哪个区取料——「照这个做」直接 openArea 它，不另立一套取料口名字；不填表示手写 */
  source?: AreaId;
}

/** 每条道库都要的三个。借道不借皮——皮必须是自己的。别在别处手写这三条。 */
export const DAOKU_BASE_SLOTS: DaokuSlot[] = [
  {
    id: "material",
    label: "你的真事",
    hint: "一条自己的事件 / 踩坑 / 做法，替掉博主的案例",
    source: "library",
  },
  { id: "painPoint", label: "读者痛点", hint: "这条要戳谁的哪个卡点" },
  { id: "asset", label: "可收藏资产", hint: "读者能存下来的清单、框架或步骤" },
];

/** 某一家的道额外要的料，蒸馏时按命中哪条道往基座上追加。同一个槽位只在这里写一次。 */
export const DAOKU_EXTRA_SLOTS = {
  situation: { id: "situation", label: "读者处境", hint: "让读者照见自己的那个具体处境，不是泛泛的人群" },
  tool: { id: "tool", label: "主流工具名", hint: "读者真会用的那个工具，冷门的换掉" },
  contrast: { id: "contrast", label: "反差点", hint: "一句“你以为很难，其实够得着”的落差" },
} satisfies Record<string, DaokuSlot>;

export interface BloggerDistillation {
  /** 一位博主一份道库：id 按 bloggerId 定死，重蒸馏就是更新它，不会在模板目录里堆出好几份 */
  id: string;
  bloggerId: string;
  /** 模板卡上显示的名字：博主名，或拆自哪条视频 */
  sourceLabel: string;
  createdAt: string;
  coreDao: string;
  topicDao: string[];
  titlePatterns: string[];
  contentPatterns: string[];
  visualPatterns: string[];
  toneRules: string[];
  boundaries: string[];
  adaptationNotes: string[];
  /** 基座三槽 + 这位博主的道额外要的料；道不同，要补的东西就不同 */
  slots: DaokuSlot[];
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
    id: "distill-blogger-xiao-a",
    bloggerId: "blogger-xiao-a",
    sourceLabel: "小A学财经",
    createdAt: "2026-08-01T00:00:00.000Z",
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
    slots: [...DAOKU_BASE_SLOTS, DAOKU_EXTRA_SLOTS.situation],
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
    id: `distill-${profile.id}`,
    bloggerId: profile.id,
    sourceLabel: profile.name,
    createdAt: new Date().toISOString(),
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
    slots: [
      ...DAOKU_BASE_SLOTS,
      ...(hasTool ? [DAOKU_EXTRA_SLOTS.tool] : []),
      ...(hasReflection ? [DAOKU_EXTRA_SLOTS.situation] : []),
    ],
  };
}

/**
 * AI 蒸馏只出「道」，外加「这位博主的道还额外要补什么料」。
 * id、名字、时间和基座三槽由服务端补——那几样不该交给模型编。
 */
export interface DistilledDao {
  coreDao: string;
  topicDao: string[];
  titlePatterns: string[];
  contentPatterns: string[];
  visualPatterns: string[];
  toneRules: string[];
  boundaries: string[];
  adaptationNotes: string[];
  /** 从 DAOKU_EXTRA_SLOTS 里挑的 id，挑不出就空数组 */
  extraSlots: string[];
}

type ExtraSlotId = keyof typeof DAOKU_EXTRA_SLOTS;

/** 把模型挑的 id 换成真正的槽位。不认识的一律丢掉——槽位的说法只有 DAOKU_EXTRA_SLOTS 一处，不让它自己造。 */
export function resolveExtraSlots(ids: string[] | undefined): DaokuSlot[] {
  return (ids || [])
    .filter((id): id is ExtraSlotId => id in DAOKU_EXTRA_SLOTS)
    .map((id) => DAOKU_EXTRA_SLOTS[id]);
}

/** 蒸馏 prompt。额外槽位那张菜单从 DAOKU_EXTRA_SLOTS 派生，改常量就跟着改，不在这里再抄一遍。 */
export function buildBloggerDistillPrompt(profile: BloggerProfile, samples: BloggerSample[]): string {
  const menu = Object.entries(DAOKU_EXTRA_SLOTS)
    .map(([id, slot]) => `- ${id}（${slot.label}）：${slot.hint}`)
    .join("\n");
  const sampleText = samples.length
    ? samples
        .map(
          (sample, index) =>
            `${index + 1}. 标题：${sample.title}\n   正文：${sample.content}\n   封面：${sample.coverDescription || "未记录"}\n   数据：${sample.metrics?.views || 0} 阅读 / ${sample.metrics?.saves || 0} 收藏`,
        )
        .join("\n")
    : "（没有样本，只能按定位推断，宁可少写也别编）";

  return `你是内容蒸馏师。从这位博主的代表作里提炼「道」——他判断一条内容能不能成立的路径，不是他的皮（口头禅、人设、具体案例、原句）。

## 博主
- 名字：${profile.name}（${profile.platform}）
- 定位：${profile.positioning}

## 代表作
${sampleText}

## 硬要求
1. 借道不借皮：标题句式写成带 X / Y 占位的模板，不许照抄原标题；正文道写"怎么组织"，不写"他写了什么"。
2. 每一条道都要过判别力测：
${DAOKU_PANBIELI}
3. 复刻这套道时，除了「你的真事 / 读者痛点 / 可收藏资产」这三样人人都要补的，这位博主的道还额外要求补什么？
   从下面这张表里挑 0-2 个 id，挑不出就给空数组，不要自己造新的：
${menu}

## 输出（严格 JSON，不要多余文字）
{
  "coreDao": "一句话说清他的判断路径",
  "topicDao": ["选题怎么挑，2-4 条"],
  "titlePatterns": ["带占位的标题句式，2-4 条"],
  "contentPatterns": ["正文怎么组织，2-4 条"],
  "visualPatterns": ["封面与配图的规律，1-3 条"],
  "toneRules": ["语气边界，2-3 条"],
  "boundaries": ["迁移时的禁区，2-3 条"],
  "adaptationNotes": ["换到「用 AI 的元技能·成长号」要怎么改，1-3 条"],
  "extraSlots": ["从上表里挑的 id，0-2 个"]
}

全程中文。`;
}

/**
 * 模型出的道盖到启发式骨架上：空字段一律留骨架的，不让一次拉胯的返回把整条道库掏空。
 * 槽位只有模型真挑出额外的那几个才动，基座三槽永远在。
 */
export function mergeDistilledDao(
  base: BloggerDistillation,
  dao: Partial<DistilledDao> | null,
): BloggerDistillation {
  if (!dao) return base;
  const list = (next: string[] | undefined, fallback: string[]) => {
    const cleaned = (next || []).map((item) => String(item).trim()).filter(Boolean);
    return cleaned.length ? cleaned : fallback;
  };
  const extra = resolveExtraSlots(dao.extraSlots);
  return {
    ...base,
    coreDao: dao.coreDao?.trim() || base.coreDao,
    topicDao: list(dao.topicDao, base.topicDao),
    titlePatterns: list(dao.titlePatterns, base.titlePatterns),
    contentPatterns: list(dao.contentPatterns, base.contentPatterns),
    visualPatterns: list(dao.visualPatterns, base.visualPatterns),
    toneRules: list(dao.toneRules, base.toneRules),
    boundaries: list(dao.boundaries, base.boundaries),
    adaptationNotes: list(dao.adaptationNotes, base.adaptationNotes),
    slots: extra.length ? [...DAOKU_BASE_SLOTS, ...extra] : base.slots,
  };
}

export function getSamplesForBlogger(bloggerId: string): BloggerSample[] {
  return DEMO_BLOGGER_SAMPLES.filter((sample) => sample.bloggerId === bloggerId);
}

export function getDistillationForBlogger(bloggerId: string): BloggerDistillation | null {
  return DEMO_BLOGGER_DISTILLATIONS.find((item) => item.bloggerId === bloggerId) || null;
}
