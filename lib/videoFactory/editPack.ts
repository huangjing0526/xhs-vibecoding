/**
 * 编辑任务包的清单。
 *
 * 走编辑通道的镜头目前要人拿着原片段去 VACE / 可灵 / Runway 上一个个跑，
 * 而界面上逐镜点开、逐个下载、再各自回想「这一镜要把谁换成谁」——
 * 三十镜的片子光是这一步就能耗掉一下午。清单把该带的信息一次性写全，
 * 人对着它按顺序跑完就行，中途不用再回来查。
 *
 * 纯文本生成，不碰文件——打包那半截在路由里，这样清单长什么样能直接拿数据验。
 */

import {
  CAST_KIND_LABEL,
  castToken,
  clipFileName,
  formatTimecode,
  resolveCastTokens,
  type BenchmarkCastEntity,
  type BenchmarkRhythm,
  type BenchmarkShot,
} from "./benchmark";
import { entitiesInShot } from "./cast";
import { shotSteps, STEP_LABEL, type ShotRisk } from "./replicability";

/**
 * 清单的文件名。
 *
 * 用 ASCII 不是嫌中文难看：macOS 自带的 zip 不给文件名打 UTF-8 标志位，
 * 也不支持 -UN=UTF8，中文名在 Windows 上解压出来是一串乱码。
 * 这个包是要发给别人跑的，文件名得所有人都打得开。内容照旧是中文。
 */
export const EDIT_PACK_MANIFEST_NAME = "README.md";

function describeEntity(entity: BenchmarkCastEntity, names: Map<string, string>): string {
  const token = castToken(entity);
  const bound = names.get(token);
  const kind = CAST_KIND_LABEL[entity.kind];
  return bound && bound !== entity.label
    ? `- ${kind}「${bound}」← 对标里是${entity.label}（第 ${entity.shots.join("、")} 镜）`
    : `- ${kind}「${entity.label}」**还没绑自己的素材**（第 ${entity.shots.join("、")} 镜）`;
}

function describeShot(
  shot: BenchmarkShot,
  risk: ShotRisk | undefined,
  cast: BenchmarkCastEntity[],
  names: Map<string, string>,
): string {
  const lines: string[] = [];
  lines.push(
    `### 第 ${shot.order} 镜 · ${clipFileName(shot.order)} · ${shot.durationSec} 秒` +
      `（原片 ${formatTimecode(shot.startSec)} → ${formatTimecode(shot.endSec)}）`,
  );
  lines.push("");

  const steps = risk ? shotSteps(risk) : [];
  if (steps.length) lines.push(`**要做**：${steps.map((step) => STEP_LABEL[step]).join(" + ")}`);

  const here = entitiesInShot(cast, shot.order);
  if (here.length) {
    lines.push(
      `**这一镜要换**：${here
        .map((entity) => names.get(castToken(entity)) || entity.label)
        .join("、")}`,
    );
  }

  if (shot.content) {
    lines.push("");
    const rows: Array<[string, string]> = [
      ["主体", shot.content.subject],
      ["构图", shot.content.framing],
      ["光线", shot.content.light],
      ["场景", shot.content.scene],
    ];
    for (const [label, text] of rows) {
      if (text) lines.push(`- ${label}：${resolveCastTokens(text, names)}`);
    }
  } else {
    lines.push("");
    lines.push("- （这一镜没抽到帧，没有画面描述，照原片段自己看）");
  }

  // 口型是这条通道最容易被忘掉的一步：换完主体它看着就像做完了
  if (steps.includes("lipsync")) {
    lines.push("");
    const said = shot.voiceover?.text ? `原片这一镜说的是「${shot.voiceover.text}」。` : "";
    lines.push(`> ⚠️ 换完主体，口型还是原片的。${said}要让他说你的词，得再补一道对口型。`);
  }
  if (risk?.workaround) {
    lines.push("");
    lines.push(`> 提示：${risk.workaround}`);
  }
  return lines.join("\n");
}

/**
 * 整份清单。
 *
 * 只写要走编辑通道、且原片段真的切出来了的那些镜头——
 * 清单里出现一个包里没有的文件，比少写一镜更让人困惑。
 */
export function buildEditPackManifest(rhythm: BenchmarkRhythm, names: Map<string, string>): string {
  const riskByShot = new Map((rhythm.report?.shots || []).map((shot) => [shot.order, shot]));
  const shots = rhythm.shots.filter((shot) => shot.clip);
  const cast = rhythm.cast || [];

  const head = [
    `# 编辑任务包 · ${rhythm.sourceLabel}`,
    "",
    `对标全片 ${rhythm.shots.length} 镜，其中 ${shots.length} 镜要走编辑通道，都在这个包里。`,
    "",
    "每个 mp4 都是从对标原片按镜头边界切下来的（已去掉音轨）。做法是把它送进视频编辑模型，",
    "**运动、构图、光线原样保留，只把画面里的人和货换成自己的**——不是拿它直接用，那是搬运。",
    "",
    "## 要换的东西",
    "",
    ...(cast.length ? cast.map((entity) => describeEntity(entity, names)) : ["- （这条片子没认出可替换的实体）"]),
    "",
    "## 逐镜",
    "",
  ];

  const body = shots.map((shot) => describeShot(shot, riskByShot.get(shot.order), cast, names));
  return [...head, body.join("\n\n"), ""].join("\n");
}
