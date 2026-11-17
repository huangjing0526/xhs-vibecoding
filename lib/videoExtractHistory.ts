/** Extraction-history compatibility mapping.
 * New rows encode structure as versioned JSON in the existing text column to preserve line breaks.
 * Legacy human-readable rows continue to decode without migration or schema changes.
 */

import { fieldToNumber, fieldToText, type FeishuRecord } from "./feishu";
import type { ScriptStructureStage, VideoExtractRecord, VideoPlatform } from "./videoExtract";
import { VIDEO_PLATFORM_LABEL } from "./videoExtract";

/** 业务键列名。upsert 用它去重：重复拆同一条视频覆盖同一行，不新增。 */
export const VIDEO_EXTRACT_KEY_COLUMN = "拆片ID";

/** 分段结构一行内的字段分隔符。选全角竖线：口播原文里几乎不会出现，英文 | 则常见于表格化文案。 */
const STAGE_SEPARATOR = "｜";

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatStructure(stages: ScriptStructureStage[]): string {
  return `json-v2:${JSON.stringify(stages)}`;
}

/**
 * 回读分段结构。人在飞书里手改过、分隔符被删掉的行也要能读出来——
 * 这时整行当作原文、阶段名留空，而不是丢掉这一段。
 */
function parseStructure(text: string): ScriptStructureStage[] {
  if (text.startsWith("json-v2:")) {
    try {
      const stages = JSON.parse(text.slice("json-v2:".length)) as ScriptStructureStage[];
      if (Array.isArray(stages)) return stages;
    } catch (error) {
      console.error("[VideoHistory] Invalid encoded structure", {
        userId: "local", tenantId: "local", action: "video.history.decodeStructure", error,
      });
    }
  }
  return splitLines(text).map((line) => {
    const parts = line.split(STAGE_SEPARATOR);
    if (parts.length < 3) return { stage: "", purpose: "", text: line };
    // 原文里若含分隔符，前两段之后的全部并回原文，避免正文被截断
    return {
      stage: parts[0].trim(),
      purpose: parts[1].trim(),
      text: parts.slice(2).join(STAGE_SEPARATOR).trim(),
    };
  });
}

/** 中文平台标签 → 内部枚举。飞书里人可能手填，认不出就落 unknown，不猜。 */
function platformFromLabel(label: string): VideoPlatform {
  const found = (Object.keys(VIDEO_PLATFORM_LABEL) as VideoPlatform[]).find(
    (key) => VIDEO_PLATFORM_LABEL[key] === label
  );
  return found || "unknown";
}

export function normalizeVideoExtractRecord(record: FeishuRecord): VideoExtractRecord {
  const fields = record.fields || {};
  const extractId = fieldToText(fields["拆片ID"]);
  return {
    extractId: extractId || record.record_id,
    extractedAt: fieldToText(fields["拆片时间"]),
    platform: platformFromLabel(fieldToText(fields["平台"])),
    sourceUrl: fieldToText(fields["视频链接"]),
    title: fieldToText(fields["标题"]),
    author: fieldToText(fields["作者"]),
    durationSec: fieldToNumber(fields["时长秒"]),
    desc: fieldToText(fields["平台文案"]),
    transcript: fieldToText(fields["口播脚本"]),
    analysis: {
      hook: fieldToText(fields["钩子"]),
      structure: parseStructure(fieldToText(fields["分段结构"])),
      style: fieldToText(fields["风格"]),
      reusableTemplate: fieldToText(fields["可复用模板"]),
      painPoint: fieldToText(fields["痛点"]),
    },
    viralityScore: fieldToNumber(fields["病毒潜力分"]),
    viralReason: fieldToText(fields["打分说明"]),
  };
}

export function mapVideoExtractToFeishuFields(record: VideoExtractRecord): Record<string, unknown> {
  return {
    "拆片ID": record.extractId,
    "拆片时间": record.extractedAt,
    "平台": VIDEO_PLATFORM_LABEL[record.platform],
    "视频链接": record.sourceUrl,
    "标题": record.title,
    "作者": record.author,
    "时长秒": record.durationSec,
    "平台文案": record.desc,
    "口播脚本": record.transcript,
    "钩子": record.analysis.hook,
    "分段结构": formatStructure(record.analysis.structure),
    "风格": record.analysis.style,
    "可复用模板": record.analysis.reusableTemplate,
    "痛点": record.analysis.painPoint,
    "病毒潜力分": record.viralityScore,
    "打分说明": record.viralReason,
  };
}
