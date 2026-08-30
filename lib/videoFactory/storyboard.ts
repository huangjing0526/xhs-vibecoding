/**
 * 分镜分析：把改写好的口播稿切成镜头表，每镜同时给出「第一帧图提示词」和「运动提示词」。
 *
 * 切段受生成引擎硬约束：图生视频每段只有 6 秒和 10 秒两档，所以镜头数由总时长反推，
 * 不是想切几个就几个。一条 45 秒的片子 ≈ 5~7 镜。
 *
 * 套了对标节奏时，「切几个镜头」不由这里定，由 unit.ts 的生成单元定：
 * 对标一个阶段里连着的短镜头会并成一次生成，成片再从那一段里跳着取出原本的几刀。
 * 所以这里的镜号是**生成单元的序号**，不是对标的镜号——两者的对应关系写在 Shot.cuts 里。
 */

import {
  castToPromptLines,
  shotContentToPrompt,
  type BenchmarkRhythm,
  type BenchmarkShotMetrics,
} from "./benchmark";
import { castNameMap, type CastBinding } from "./cast";
// 只取类型，运行时不成环：unit.ts 反过来要用本文件的 metricsToCameraMove
import { unitSourceOrders, type GenerationUnit } from "./unit";
import {
  PROVIDER_CAPS,
  SHOT_DURATIONS,
  type ScriptDraft,
  type Shot,
  type ShotCut,
  type ShotDuration,
  type Storyboard,
  type VideoGenProviderId,
} from "./types";

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * 可选运镜。给模型当词表，也给人当一键切换的选项。
 * `motion` 是写进运动提示词开头的那句话，刻意不带逗号——换运镜时要按整句替换。
 */
export const CAMERA_MOVES = [
  { id: "static", label: "固定", motion: "镜头保持固定", use: "讲步骤、给特写、需要观众看清细节时" },
  { id: "push", label: "推近", motion: "镜头缓慢向前推进", use: "开头钩子、情绪递进、强调重点时" },
  { id: "pull", label: "拉远", motion: "镜头缓慢向后拉远", use: "揭示全貌、结尾收束时" },
  { id: "pan", label: "横移", motion: "镜头平稳横向平移", use: "扫过一排物品、展开场景时" },
  { id: "tilt", label: "升降", motion: "镜头缓慢上下移动", use: "从局部带到整体、展示高度时" },
  { id: "follow", label: "跟随", motion: "镜头跟随主体移动", use: "主体在走动或手在操作时" },
  { id: "orbit", label: "环绕", motion: "镜头绕主体缓慢环绕", use: "展示产品外观、强调质感时" },
  { id: "handheld", label: "手持", motion: "手持镜头轻微晃动", use: "要真实感、生活感、临场感时" },
] as const;

export type CameraMove = (typeof CAMERA_MOVES)[number];

/**
 * 把量出来的机位翻成运镜标签。
 *
 * 只在测得准的时候给：机位固定就是固定，机位移动配跟随。
 * 「主体走近」不算运镜——那是人在动，机位没动，写成推近会让模型真的去推镜头，
 * 味道就完全变了。这个区别缩略图上看不出来，只能靠量。
 */
export function metricsToCameraMove(metrics: BenchmarkShotMetrics | undefined): string {
  if (!metrics) return "";
  if (metrics.unavailable?.cameraMotion) return "";
  if (metrics.cameraMotion === "fixed") return "固定";
  if (metrics.cameraMotion === "moving") return "跟随";
  return "";
}

/** 运动提示词开头那句运镜，认得出就整句换掉，认不出就插到最前面。 */
export function applyCameraMove(videoPrompt: string, move: CameraMove): string {
  const rest = str(videoPrompt).replace(/^(?:手持)?镜头[^，。]*[，。]?\s*/, "");
  return rest ? `${move.motion}，${rest}` : move.motion;
}

/**
 * 引擎能用的时长档位，从小到大。
 * 回传通道没有档位约束，这时退回全量并集——它只被用来收敛外部传进来的脏数据。
 */
function durationLadder(provider: VideoGenProviderId): ShotDuration[] {
  const caps = PROVIDER_CAPS[provider].durations;
  return [...(caps.length ? caps : SHOT_DURATIONS)].sort((a, b) => a - b);
}

/**
 * 把任意时长吸附到该引擎支持的档位。
 *
 * 吸附到最近的一档而不是回落到某个固定值：换引擎是这个函数最主要的使用场景
 * （分镜按 grok 的 10 秒切好，改用 Veo 时该变成 8 秒而不是 6 秒），
 * 回落到固定值会把用户精心调过的节奏一把抹平。
 */
export function snapShotDuration(value: unknown, provider: VideoGenProviderId): ShotDuration {
  const ladder = durationLadder(provider);
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return ladder[0];
  if (ladder.includes(num as ShotDuration)) return num as ShotDuration;
  return ladder.reduce((best, current) =>
    Math.abs(current - num) < Math.abs(best - num) ? current : best,
  );
}

/** 按总时长估这条片子该切几镜，只作为给模型的建议值。 */
export function suggestShotCount(totalDurationSec: number): number {
  // 平均按 8 秒一镜，下限 3 上限 12——超过 12 镜生成成本和拼接成本都不划算
  return Math.min(12, Math.max(3, Math.round(totalDurationSec / 8)));
}

/**
 * 给模型看的脚本。
 * 口播全文单独成块、不带任何标签——模型是照着这块切 voiceover 的，
 * 一旦把「钩子：」「痛点：」这类标签混在正文里，它会当成口播内容切进字幕。
 */
function scriptSection(script: ScriptDraft): string {
  const fullVoiceover = [script.hook, ...script.segments.map((item) => item.voiceover), script.cta]
    .map((text) => (text || "").trim())
    .filter(Boolean)
    .join("\n");
  const outline = script.segments
    .map((item, index) => `${index + 1}. ${item.stage || `第 ${index + 1} 段`}：${item.purpose || "（未标注）"}`)
    .join("\n");

  return `标题（不要念出来，只作参考）：${script.title}

【口播全文】voiceover 只能从这里按顺序切，一个字都不要改：
${fullVoiceover || "（空）"}

【分段结构】只帮你理解节奏，绝对不要写进 voiceover 或 subtitle：
${outline || "（空）"}`;
}

/** 运镜词表渲染成给模型看的清单，与 CAMERA_MOVES 单一来源，改一处就够。 */
const CAMERA_MOVE_TABLE = CAMERA_MOVES.map((move) => `- ${move.label}：${move.use}`).join("\n");

/**
 * 一个生成单元在提示词里的抬头：它对着对标的哪几镜、属于哪一段。
 * 镜号是单元序号，对标镜号写在括号里——模型要照着写画面，就得知道这一镜里塞进了对标的哪几镜。
 */
function unitHeading(unit: GenerationUnit, index: number): string {
  const orders = unitSourceOrders(unit);
  const from = orders.length ? `对标第 ${orders.join("、")} 镜${unit.cuts.length > 1 ? "合并" : ""}` : "";
  const tag = [unit.stage ? `「${unit.stage}」段` : "", from].filter(Boolean).join("，");
  return `第 ${index + 1} 镜${tag ? `（${tag}）` : ""}`;
}

/**
 * 每个生成单元一个块：时长、实测结构、对标画面，全写在一起。
 *
 * 早先这三样是三段各写一遍、各按对标镜号索引的。并镜之后对标镜号和成片镜号不再一一对应，
 * 三段各自映射一次就是三个出错的机会；合成一块之后，「这一镜是什么」只在一个地方说。
 *
 * 没量到的、没看到的一个字都不提——写占位符模型会当真去编。
 */
function unitBriefs(
  units: GenerationUnit[],
  shotContent: Map<number, string>,
): string {
  return units
    .map((unit, index) => {
      const lines = [unitHeading(unit, index)];
      const cutPlan =
        unit.cuts.length > 1
          ? `；组内要切 ${unit.cuts.length} 刀：${unit.cuts.map((cut) => `${cut.durationSec} 秒`).join(" + ")}`
          : "";
      lines.push(`  时长：生成 ${unit.generateSec} 秒，成片用 ${unit.trimToSec} 秒${cutPlan}`);
      if (unit.measured) lines.push(`  实测：${unit.measured}`);
      for (const [at, cut] of unit.cuts.entries()) {
        const content = shotContent.get(cut.sourceShotOrder);
        const which = unit.cuts.length > 1 ? `第 ${at + 1} 刀，对标第 ${cut.sourceShotOrder} 镜` : "";
        const label = which ? `  画面（${which}）` : "  画面";
        lines.push(`${label}：${content || "这一段没看到对标画面，按脚本内容自己写，别照抄相邻镜头"}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildStoryboardPrompt(
  script: ScriptDraft,
  options?: {
    visualStyle?: string;
    rhythm?: BenchmarkRhythm | null;
    /** 套了对标节奏时由 unit.ts 排好的生成单元；没套就不传，按时长估镜头数 */
    units?: GenerationUnit[] | null;
    castBinding?: CastBinding;
  },
): string {
  const rhythm = options?.rhythm || null;
  const units = options?.units?.length ? options.units : null;
  const shotCount = units ? units.length : suggestShotCount(script.estimatedDurationSec);

  // 占位符在这里就换成用户绑定的素材名——让模型自己判断「哪部分该换」的话，
  // 同一份对标每次改写出来的画面都不一样
  const names = castNameMap(rhythm?.cast, options?.castBinding);
  const shotContent = new Map<number, string>();
  for (const shot of rhythm?.shots || []) {
    if (shot.content) shotContent.set(shot.order, shotContentToPrompt(shot.content, names));
  }

  const hasMeasured = Boolean(units?.some((unit) => unit.measured));
  // 套了对标节奏就按对标的镜头数和每镜时长走，这是这条爆款用播放量验证过的节奏，别让模型自由发挥
  const rhythmSection = units
    ? `\n【必须照这个节奏切，这是对标「${rhythm?.sourceLabel || "这条片子"}」的真实镜头表】
一共 ${shotCount} 个镜头。每一镜下面写清了三样东西，都要照做：
成片时长（一秒都不要改）、从对标片里**量出来**的机位和运动（不是猜的）、对标那几镜画面里实际拍了什么。

${unitBriefs(units, shotContent)}

- 不要增减镜头数，也不要改每镜的时长。
- durationSec 填上面写的「生成 N 秒」，trimToSec 填「成片用 N 秒」。
- 口播按成片时长的比例分配：镜头短就只给几个字，镜头长才给整句。
${
  units.some((unit) => unit.cuts.length > 1)
    ? `
【关于「合并」的那几镜，这是这份分镜表最要紧的一条】
对标那几个连着的短镜头，是同一个机位、同一个场景里连续发生的事。
所以你**一次**把它们写成一镜：一张首帧、一段运动，覆盖这几刀里发生的全过程。
剪辑时会从这一段生成出来的画面里跳着取出那几刀，接起来就还原成对标原本的碎切节奏。

- framePrompt 写这一整段的开头长什么样，videoPrompt 写这一整段怎么一路演下去。
  不要写成「先……然后切到……」——它是一镜连续画面，切口是后期剪出来的，不是画出来的。
- cuts 里逐刀给字幕和口播，条数必须和上面写的刀数一模一样，顺序也一样。
  口播在整镜里是连贯的一句话或几句话，按刀切开填进去，不重不漏。
- 没写「组内要切几刀」的镜头就不要给 cuts。`
    : ""
}
`
    : "";

  return `你在把一份口播脚本拆成 AI 视频的分镜表。

【口播脚本】
${scriptSection(script)}

【画面风格】
${options?.visualStyle?.trim() || "未指定，按脚本内容自己定一个统一的风格，并在 continuityNote 里说清"}

【生成引擎的硬约束，必须遵守】
- 成片是竖版 9:16。
- 每个镜头只能是 6 秒或 10 秒，没有别的档位。
- 每镜的做法是：先出一张静态的第一帧图，再让模型把这张图动起来。
  所以 framePrompt 描述「画面长什么样」，videoPrompt 只描述「怎么动」，两者不要重复。
${units ? "" : `- 镜头总数建议 ${shotCount} 个左右，所有镜头时长加起来应接近 ${script.estimatedDurationSec} 秒。\n`}${rhythmSection}${
    rhythm?.cast?.length
      ? `\n【人、货、场景已经换成你自己的了，对照表】
${castToPromptLines(rhythm.cast, names)}

- 主体一律用上面对照表里的说法，不要写回对标里原本那个人或那件货。
- 构图、景别、光线、色调照对标复现，这是这条对标值钱的地方；换掉的只有人、货、地方。\n`
      : ""
  }
【运镜怎么挑】
可选的运镜只有这几种，cameraMove 只能填其中一个标签：
${CAMERA_MOVE_TABLE}
${
  hasMeasured
    ? `
硬要求：
- 上面量出来的那几镜，机位以实测为准，不要为了"有变化"去改它。
  对标要是全片固定机位，那就全片固定——同一个人同一个场景，一致性本身就是卖点。
- 「主体走近/后退」是人在动，不是镜头在动：仍然填「固定」，把走近或后退写进 videoPrompt 的动作部分。
  把它写成推近或拉远，模型就会真的去推镜头，出来的味道完全不是对标那条。
- 只有没量到的镜头才需要自己挑运镜，挑的时候避免和相邻镜头重复。`
    : `
硬要求：
- 相邻两个镜头不能用同一种运镜。
- 整条片子至少用到 3 种不同运镜。
- 只有「确实该让观众盯住画面看清楚」的镜头才写固定，其余都该有镜头运动。
- 开头第一镜不要用固定——静止开场最容易被划走。`
}

【写提示词的要求】
- 两个提示词都用中文写，不要中英混写。
- framePrompt：主体、构图、景别、光线、色调、材质都要具体，竖构图，不要写运动。
  有对标画面描述的镜头，framePrompt 就是把那几段展开成完整句子——构图光线照抄，主体用对照表里的说法。
- videoPrompt：第一句必须是运镜本身，第二句才写主体的动作。
  例：「镜头缓慢向前推进，人物抬头看向镜头，发丝轻微飘动。」
  不要重复描述画面内容，不要要求画面里出现文字。
- 跨镜头如果是同一个人/同一件产品，framePrompt 里要用同样的措辞描述外观，否则会换脸。
- voiceover 是「口播全文」的连续切片：按镜头顺序把全文切开，前一镜的结尾接后一镜的开头，不重不漏。
- voiceover 和 subtitle 里都不许出现「标题」「钩子」「痛点」「干货」「转折」「行动号召」这类段落标签，
  那是结构说明不是口播内容。subtitle 是 voiceover 的精简版。

只返回 JSON，不要解释。格式：
{
  "shots": [
    {
      "order": 1,
      "durationSec": 6,
      "trimToSec": 6,
      "shotSize": "景别，如 中景",
      "cameraMove": "运镜，只能填上面词表里的标签",
      "visual": "这一镜画面里发生什么，一句话",
      "voiceover": "这一镜对应的口播原文切片",
      "subtitle": "压在画面上的字幕",
      "framePrompt": "第一帧图的完整提示词",
      "videoPrompt": "让这张图动起来的运动提示词",
      "cuts": [
        { "subtitle": "这一刀的字幕", "voiceover": "这一刀的口播" }
      ]
    }
  ],
  "continuityNote": "跨镜头怎么保持人物/产品/场景一致，写给操作的人看"
}
cuts 只有「组内要切几刀」的镜头才给；给了就必须刚好那么多条。给了 cuts 的镜头，
外面那两个 voiceover / subtitle 留空字符串——同一句话不要写两遍。`;
}

/** 未配置 AI 时的兜底：按脚本分段一段一镜，提示词留空等人填。 */
export function createFallbackStoryboard(script: ScriptDraft, provider: VideoGenProviderId): Storyboard {
  const pieces = [
    script.hook ? { stage: "钩子", text: script.hook } : null,
    ...script.segments.map((item) => ({ stage: item.stage, text: item.voiceover })),
    script.cta ? { stage: "行动号召", text: script.cta } : null,
  ].filter((item): item is { stage: string; text: string } => Boolean(item));

  return {
    shots: pieces.map((item, index) => ({
      order: index + 1,
      durationSec: snapShotDuration(6, provider),
      shotSize: "",
      // 开场推近、收尾拉远是最不会错的两笔，其余留空等人挑
      cameraMove: index === 0 ? "推近" : index === pieces.length - 1 ? "拉远" : "",
      visual: "",
      voiceover: item.text,
      subtitle: "",
      framePrompt: "",
      videoPrompt: "",
    })),
    continuityNote: "未配置 AI，已按脚本分段一段一镜，画面与提示词请手动补。",
  };
}

/** 模型逐刀给的文案。时间码不收——那是服务端按引擎档位算出来的，模型碰不到。 */
interface RawCut {
  subtitle?: unknown;
  voiceover?: unknown;
}

/**
 * 把一个生成单元的切点和模型写的文案拼成成片指令。
 *
 * 模型漏了 cuts 或条数对不上时不作废这一镜：时间码是服务端算的，照样切得出来，
 * 缺的只是文案。这时把整镜的口播落到第一刀上——宁可字幕挤在开头，
 * 也好过整段没有声音，而后者在成片里是看不出原因的。
 */
function buildShotCuts(unit: GenerationUnit, raw: unknown, fallbackText: ShotText): ShotCut[] {
  const given = (Array.isArray(raw) ? raw : []) as RawCut[];
  const cuts = unit.cuts.map((cut, index) => ({
    ...cut,
    subtitle: str(given[index]?.subtitle),
    voiceover: str(given[index]?.voiceover),
  }));
  if (!cuts.some((cut) => cut.voiceover || cut.subtitle)) cuts[0] = { ...cuts[0], ...fallbackText };
  return cuts;
}

interface ShotText {
  voiceover: string;
  subtitle: string;
}

/**
 * 收敛模型返回。
 *
 * **套了对标节奏时按单元遍历，不按模型返回的条数遍历。** 单元数、时长、切点、实测机位
 * 全是服务端按引擎档位和实测结构算出来的硬数据，模型只往里填文案。
 * 反过来按模型的数组走的话，它少回一镜，后面每一镜都会对到别的单元上——
 * 而并了镜的镜头文案全在 cuts 里、外层字段是空的，很容易被「这镜是空的」之类的判据丢掉。
 * 缺的那几镜宁可留成空提示词摆在界面上，也不能让整表悄悄错位一格。
 *
 * 没套对标节奏（没有单元）时才按模型返回走，那条路径本来就是它说切几镜就几镜。
 */
export function normalizeStoryboard(
  raw: Storyboard | undefined,
  fallback: Storyboard,
  provider: VideoGenProviderId,
  units?: GenerationUnit[] | null,
): Storyboard {
  if (!raw) return fallback;
  const given = Array.isArray(raw.shots) ? raw.shots : [];
  const continuityNote = str(raw.continuityNote);

  if (units?.length) {
    const shots: Shot[] = units.map((unit, index) => {
      const shot = given[index];
      const text: ShotText = { voiceover: str(shot?.voiceover), subtitle: str(shot?.subtitle) };
      return {
        order: index + 1,
        durationSec: unit.generateSec,
        trimToSec: unit.trimToSec,
        shotSize: str(shot?.shotSize),
        // 实测量到什么就钉什么。模型很爱为了「有变化」把固定机位改成推近，
        // 而那是人在动还是镜头在动的区别，改错了整条片子的味道就不对了
        cameraMove: unit.cameraMove || str(shot?.cameraMove),
        visual: str(shot?.visual),
        // 文案全归 cuts，外层这两个留空：同一句话存两份迟早对不上，
        // 而对不上的时候没人说得清该信哪一份
        voiceover: "",
        subtitle: "",
        framePrompt: str(shot?.framePrompt),
        videoPrompt: str(shot?.videoPrompt),
        cuts: buildShotCuts(unit, shot?.cuts, text),
      };
    });
    return { shots, continuityNote };
  }

  const shots: Shot[] = given
    .filter((shot) => shot && (str(shot.visual) || str(shot.voiceover) || str(shot.framePrompt)))
    .map((shot, index) => {
      const durationSec = snapShotDuration(shot.durationSec, provider);
      const rawTrim = typeof shot.trimToSec === "number" ? shot.trimToSec : Number(shot.trimToSec);
      // 成片时长不能超过生成时长，也不接受 0 和负数——超了就等于没剪
      const trimToSec = Number.isFinite(rawTrim) && rawTrim > 0 ? Math.min(rawTrim, durationSec) : undefined;
      return {
        order: index + 1,
        durationSec,
        shotSize: str(shot.shotSize),
        cameraMove: str(shot.cameraMove),
        visual: str(shot.visual),
        voiceover: str(shot.voiceover),
        subtitle: str(shot.subtitle),
        framePrompt: str(shot.framePrompt),
        videoPrompt: str(shot.videoPrompt),
        ...(trimToSec === undefined ? {} : { trimToSec }),
      };
    });
  if (!shots.length) return fallback;
  return { shots, continuityNote };
}

/**
 * 成片里实际要拼的一段。
 *
 * 分镜表按**生成单元**存，成片按**刀**走——并了镜的一镜在成片里是好几刀，
 * 每刀从生成出来的画面里取不同的一段，接起来才有对标那种碎切。
 * 没套对标节奏的镜头展开成一刀，所以下游只有一条路径，不用到处判 cuts 在不在。
 */
export interface ComposePart {
  /** 素材取哪一镜的成片 */
  shotOrder: number;
  /** 这一镜里的第几刀，从 0 起。配音落点按它区分 */
  cutIndex: number;
  /** 从那段视频的第几秒开始取 */
  fromSec: number;
  /** 取多长 */
  durationSec: number;
  /** 对标片里的第几镜；没套对标节奏就没有 */
  sourceShotOrder?: number;
  subtitle: string;
  voiceover: string;
}

/** 一镜展开成刀。界面、合成、清单共用这一份，别在各处各判一次 cuts 在不在。 */
export function shotParts(shot: Shot): ComposePart[] {
  if (shot.cuts?.length) {
    return shot.cuts.map((cut, cutIndex) => ({
      shotOrder: shot.order,
      cutIndex,
      fromSec: cut.fromSec,
      durationSec: cut.durationSec,
      sourceShotOrder: cut.sourceShotOrder,
      subtitle: cut.subtitle,
      voiceover: cut.voiceover,
    }));
  }
  return [
    {
      shotOrder: shot.order,
      cutIndex: 0,
      fromSec: 0,
      durationSec: shot.trimToSec ?? shot.durationSec,
      subtitle: shot.subtitle,
      voiceover: shot.voiceover,
    },
  ];
}

export function storyboardParts(storyboard: Storyboard): ComposePart[] {
  return storyboard.shots.flatMap(shotParts);
}

/** 这一镜对着对标的哪几镜。取参考图、回看实测结构都要用，别在各处各推一遍。 */
export function shotSourceOrders(shot: Shot): number[] {
  const orders = shotParts(shot)
    .map((part) => part.sourceShotOrder)
    .filter((order): order is number => typeof order === "number");
  return [...new Set(orders)];
}

/**
 * 分镜表的成片总时长。
 *
 * 按刀求和，不按镜求和：并了镜的一镜在成片里只用它那几刀，
 * 而「一镜实际用多长」的真相在 shotParts 里，两处各算一遍迟早会分叉。
 */
export function storyboardDurationSec(storyboard: Storyboard): number {
  const total = storyboardParts(storyboard).reduce((sum, part) => sum + part.durationSec, 0);
  return Math.round(total * 10) / 10;
}
