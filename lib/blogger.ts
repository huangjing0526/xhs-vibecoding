/** Collector compatibility mappings over the desktop profile/sample tables.
 * Legacy daoku columns can be decoded explicitly; active routes use the desktop local daoku store.
 */

import { fieldToNumber, fieldToOptionalNumber, fieldToText, type FeishuRecord } from "./feishu";
import * as desktopBlogger from "./bloggerFeishu";
import { DAOKU_BASE_SLOTS } from "./bloggerWorkflow";
import type { BloggerDistillation, BloggerNote, BloggerProfile } from "./bloggerWorkflow";
import type { ViralAnalysis, ViralMetrics } from "./viralSignals";

/** 两张表的业务键列名。upsert 用它建索引，与下面映射函数里的字面量是同一个来源。 */
export const BLOGGER_KEY_COLUMN = "账号ID";
export const BLOGGER_NOTE_KEY_COLUMN = "笔记ID";

function splitLines(text: string): string[] {
  return text
    .split(/\n|、/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 话题标签按空白分隔（\s 已含换行）。与 normalizeDraftNote 对「话题标签」列的解析保持一致。 */
function splitTags(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

// ---------------------------------------------------------------- 对标账号

export function normalizeBloggerProfile(record: FeishuRecord): BloggerProfile {
  const fields = record.fields || {};
  return {
    recordId: record.record_id,
    ...desktopBlogger.normalizeBloggerProfile(record),
    bio: fieldToText(fields["简介"]),
    followers: fieldToOptionalNumber(fields["粉丝数"]),
    noteCount: fieldToOptionalNumber(fields["作品数"]),
    status: fieldToText(fields["状态"]),
    lastCollectedAt: fieldToText(fields["最近采集时间"]),
  };
}

export function mapBloggerProfileToFeishuFields(profile: BloggerProfile): Record<string, unknown> {
  const common = desktopBlogger.mapBloggerProfileToFeishuFields(profile);
  // Empty collector values mean unknown, not an instruction to erase curated fields.
  if (!profile.positioning) delete common["定位"];
  if (!profile.name) delete common["昵称"];
  return {
    ...common,
    ...(profile.bio ? { "简介": profile.bio } : {}),
    "状态": profile.status,
    ...(profile.followers !== undefined ? { "粉丝数": profile.followers } : {}),
    ...(profile.noteCount !== undefined ? { "作品数": profile.noteCount } : {}),
    ...(profile.lastCollectedAt ? { "最近采集时间": profile.lastCollectedAt } : {}),
  };
}

/**
 * 读道库。未蒸馏的账号行这些列全空，返回 null 而不是一个全空对象——
 * 让「没蒸馏过」和「蒸馏出空结果」在类型层可区分。
 */
export function normalizeBloggerDistillation(record: FeishuRecord): BloggerDistillation | null {
  const fields = record.fields || {};
  const coreDao = fieldToText(fields["核心道"]);
  const bloggerId = fieldToText(fields["账号ID"]) || record.record_id;

  const distillation: BloggerDistillation = {
    id: `distill-${bloggerId}`,
    bloggerId,
    sourceLabel: fieldToText(fields["昵称"]) || bloggerId,
    createdAt: "",
    slots: DAOKU_BASE_SLOTS.map((slot) => ({ ...slot })),
    coreDao,
    topicDao: splitLines(fieldToText(fields["选题道"])),
    titlePatterns: splitLines(fieldToText(fields["标题范式"])),
    contentPatterns: splitLines(fieldToText(fields["正文范式"])),
    visualPatterns: splitLines(fieldToText(fields["视觉范式"])),
    toneRules: splitLines(fieldToText(fields["语气规则"])),
    boundaries: splitLines(fieldToText(fields["边界"])),
    adaptationNotes: splitLines(fieldToText(fields["迁移备注"])),
  };

  // 判「有没有蒸馏过」要看全部 8 个字段，不挑子集：只填了「视觉范式」的行同样是蒸馏过的，
  // 挑子集会让那一行明明有数据却被判为 null，且加列时没人知道要不要补进这个判断。
  const hasAny =
    Boolean(coreDao) ||
    [
      distillation.topicDao,
      distillation.titlePatterns,
      distillation.contentPatterns,
      distillation.visualPatterns,
      distillation.toneRules,
      distillation.boundaries,
      distillation.adaptationNotes,
    ].some((list) => list.length > 0);

  return hasAny ? distillation : null;
}

export function mapDistillationToFeishuFields(distillation: BloggerDistillation): Record<string, unknown> {
  return {
    "核心道": distillation.coreDao,
    "选题道": distillation.topicDao.join("\n"),
    "标题范式": distillation.titlePatterns.join("\n"),
    "正文范式": distillation.contentPatterns.join("\n"),
    "视觉范式": distillation.visualPatterns.join("\n"),
    "语气规则": distillation.toneRules.join("\n"),
    "边界": distillation.boundaries.join("\n"),
    "迁移备注": distillation.adaptationNotes.join("\n"),
  };
}

// ---------------------------------------------------------------- 对标笔记

function normalizeMetrics(fields: Record<string, unknown>): ViralMetrics {
  return {
    views: fieldToOptionalNumber(fields["阅读量"]),
    likes: fieldToOptionalNumber(fields["点赞量"]),
    saves: fieldToOptionalNumber(fields["收藏量"]),
    comments: fieldToOptionalNumber(fields["评论量"]),
    shares: fieldToOptionalNumber(fields["分享量"]),
  };
}

/**
 * 打分产出的列全空时视为「还没打分」，返回 undefined，避免 0 分被当成真实评分。
 * 列全列出、不挑子集：本代码写入时 `打分说明` 恒非空，但飞书可被人手改，
 * 只认一列会把人工填的打分判成「没打过」。
 */
const SCORE_COLUMNS = ["打分说明", "命中信号", "内容类型", "钩子句", "信息密度", "病毒潜力分"];

function normalizeAnalysisFields(fields: Record<string, unknown>): ViralAnalysis | undefined {
  if (SCORE_COLUMNS.every((column) => !fieldToText(fields[column]))) return undefined;

  return {
    contentType: fieldToText(fields["内容类型"]),
    infoDensity: fieldToText(fields["信息密度"]),
    viralityScore: fieldToNumber(fields["病毒潜力分"]),
    hitSignals: splitLines(fieldToText(fields["命中信号"])),
    hookSentence: fieldToText(fields["钩子句"]),
    reason: fieldToText(fields["打分说明"]),
    engagementRate: fieldToOptionalNumber(fields["互动率"]),
  };
}

export function normalizeBloggerNote(record: FeishuRecord): BloggerNote {
  const fields = record.fields || {};
  const noteId = fieldToText(fields["笔记ID"]);
  return {
    recordId: record.record_id,
    noteId,
    /** 展示用主键，由 noteId 派生；去重一律用 noteId */
    ...desktopBlogger.normalizeBloggerSample(record),
    url: fieldToText(fields["链接"]),
    publishedAt: fieldToText(fields["发布时间"]),
    metrics: normalizeMetrics(fields),
    analysis: normalizeAnalysisFields(fields),
  };
}

export function mapBloggerNoteToFeishuFields(note: BloggerNote): Record<string, unknown> {
  const metrics = note.metrics || {};
  const analysis = note.analysis;

  return {
    ...desktopBlogger.mapBloggerSampleToFeishuFields({ ...note, id: note.noteId }),
    "链接": note.url,
    "发布时间": note.publishedAt,
    ...(metrics.views !== undefined ? { "阅读量": metrics.views } : {}),
    ...(metrics.likes !== undefined ? { "点赞量": metrics.likes } : {}),
    ...(metrics.saves !== undefined ? { "收藏量": metrics.saves } : {}),
    ...(metrics.comments !== undefined ? { "评论量": metrics.comments } : {}),
    ...(metrics.shares !== undefined ? { "分享量": metrics.shares } : {}),
    ...(analysis
      ? {
          "内容类型": analysis.contentType,
          "信息密度": analysis.infoDensity,
          "病毒潜力分": analysis.viralityScore,
          "命中信号": analysis.hitSignals.join("\n"),
          "钩子句": analysis.hookSentence,
          "打分说明": analysis.reason,
          ...(analysis.engagementRate !== undefined ? { "互动率": analysis.engagementRate } : {}),
        }
      : {}),
  };
}
