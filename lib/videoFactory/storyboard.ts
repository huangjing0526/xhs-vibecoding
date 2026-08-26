/**
 * 分镜分析：把改写好的口播稿切成镜头表，每镜同时给出「第一帧图提示词」和「运动提示词」。
 *
 * 切段受生成引擎硬约束：图生视频每段只有 6 秒和 10 秒两档，所以镜头数由总时长反推，
 * 不是想切几个就几个。一条 45 秒的片子 ≈ 5~7 镜。
 */

import { rhythmShotCount, rhythmToPlanLines, type BenchmarkRhythm } from "./benchmark";
import { SHOT_DURATIONS, type ScriptDraft, type Shot, type ShotDuration, type Storyboard } from "./types";

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

/** 运动提示词开头那句运镜，认得出就整句换掉，认不出就插到最前面。 */
export function applyCameraMove(videoPrompt: string, move: CameraMove): string {
  const rest = str(videoPrompt).replace(/^(?:手持)?镜头[^，。]*[，。]?\s*/, "");
  return rest ? `${move.motion}，${rest}` : move.motion;
}

/** 把任意时长吸附到引擎支持的档位，越界一律回落到 6 秒。 */
export function snapShotDuration(value: unknown): ShotDuration {
  const num = typeof value === "number" ? value : Number(value);
  return SHOT_DURATIONS.includes(num as ShotDuration) ? (num as ShotDuration) : 6;
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

export function buildStoryboardPrompt(
  script: ScriptDraft,
  options?: { visualStyle?: string; rhythm?: BenchmarkRhythm | null },
): string {
  const rhythm = options?.rhythm || null;
  const shotCount = rhythm ? rhythmShotCount(rhythm) : suggestShotCount(script.estimatedDurationSec);
  // 套了对标节奏就按对标的镜头数和每镜时长走，这是这条爆款用播放量验证过的节奏，别让模型自由发挥
  const rhythmSection = rhythm
    ? `\n【必须照这个节奏切，这是对标「${rhythm.sourceLabel}」的真实镜头表】
一共 ${shotCount} 个镜头，每镜的成片时长如下，一秒都不要改：
${rhythmToPlanLines(rhythm)}

- 口播按这个时长比例分配：镜头短就只给几个字，镜头长才给整句。
- durationSec 只能填 6 或 10，取「不小于成片时长」的那一档；trimToSec 填上面给的成片时长。
- 不要增减镜头数。\n`
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
- 镜头总数建议 ${shotCount} 个左右，所有镜头时长加起来应接近 ${script.estimatedDurationSec} 秒。
${rhythmSection}
【运镜必须挑，不要一律静止】
可选的运镜只有这几种，cameraMove 只能填其中一个标签：
${CAMERA_MOVE_TABLE}

硬要求：
- 相邻两个镜头不能用同一种运镜。
- 整条片子至少用到 3 种不同运镜。
- 只有「确实该让观众盯住画面看清楚」的镜头才写固定，其余都该有镜头运动。
- 开头第一镜不要用固定——静止开场最容易被划走。

【写提示词的要求】
- 两个提示词都用中文写，不要中英混写。
- framePrompt：主体、构图、景别、光线、色调、材质都要具体，竖构图，不要写运动。
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
      "videoPrompt": "让这张图动起来的运动提示词"
    }
  ],
  "continuityNote": "跨镜头怎么保持人物/产品/场景一致，写给操作的人看"
}`;
}

/** 未配置 AI 时的兜底：按脚本分段一段一镜，提示词留空等人填。 */
export function createFallbackStoryboard(script: ScriptDraft): Storyboard {
  const pieces = [
    script.hook ? { stage: "钩子", text: script.hook } : null,
    ...script.segments.map((item) => ({ stage: item.stage, text: item.voiceover })),
    script.cta ? { stage: "行动号召", text: script.cta } : null,
  ].filter((item): item is { stage: string; text: string } => Boolean(item));

  return {
    shots: pieces.map((item, index) => ({
      order: index + 1,
      durationSec: 6 as ShotDuration,
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

/** 收敛模型返回：镜号重排、时长吸附，坏镜头直接丢掉而不是让整表报废。 */
export function normalizeStoryboard(raw: Storyboard | undefined, fallback: Storyboard): Storyboard {
  if (!raw) return fallback;
  const shots = Array.isArray(raw.shots) ? raw.shots : [];
  const normalized: Shot[] = shots
    .filter((shot) => shot && (str(shot.visual) || str(shot.voiceover) || str(shot.framePrompt)))
    .map((shot, index) => {
      const durationSec = snapShotDuration(shot.durationSec);
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
  if (!normalized.length) return fallback;
  return { shots: normalized, continuityNote: str(raw.continuityNote) };
}

/**
 * 分镜表的成片总时长。
 * 剪短用的镜头按剪完的算——不然套了对标节奏的片子会显示成两倍长，白报警。
 */
export function storyboardDurationSec(storyboard: Storyboard): number {
  const total = storyboard.shots.reduce((sum, shot) => sum + (shot.trimToSec ?? shot.durationSec), 0);
  return Math.round(total * 10) / 10;
}
