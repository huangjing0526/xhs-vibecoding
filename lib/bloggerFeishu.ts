/**
 * 对标账号 / 对标笔记两张飞书表的读写映射。中文列名以本文件的字面量为单一来源，与 lib/xhsWorkflow.ts 同一约定。
 *
 * 两张表只存博主和样本。蒸馏出的道库带槽位，表里没有对应的列，模板仍以 .local/daoku 为准（见 app/api/daoku），
 * 这里不读也不写「核心道」等道库列。
 */
import { fieldToOptionalNumber, fieldToText, type FeishuRecord } from "./feishu";
import type { BloggerProfile, BloggerSample } from "./bloggerWorkflow";

export function normalizeBloggerProfile(record: FeishuRecord): BloggerProfile {
  const fields = record.fields || {};
  return {
    id: fieldToText(fields["账号ID"]) || record.record_id,
    name: fieldToText(fields["昵称"]),
    platform: fieldToText(fields["平台"]),
    homepageUrl: fieldToText(fields["主页链接"]) || undefined,
    positioning: fieldToText(fields["定位"]) || fieldToText(fields["简介"]),
    status: fieldToText(fields["状态"]),
  };
}

export function mapBloggerProfileToFeishuFields(profile: BloggerProfile): Record<string, unknown> {
  return {
    "账号ID": profile.id,
    "昵称": profile.name,
    "平台": profile.platform,
    "主页链接": profile.homepageUrl || "",
    "定位": profile.positioning,
    "状态": profile.status,
  };
}

export function normalizeBloggerSample(record: FeishuRecord): BloggerSample {
  const fields = record.fields || {};
  return {
    id: fieldToText(fields["笔记ID"]) || record.record_id,
    bloggerId: fieldToText(fields["账号ID"]),
    title: fieldToText(fields["标题"]),
    content: fieldToText(fields["正文"]),
    tags: fieldToText(fields["话题标签"]).split(/\s+/).filter(Boolean),
    coverDescription: fieldToText(fields["封面描述"]) || undefined,
    metrics: {
      views: fieldToOptionalNumber(fields["阅读量"]),
      likes: fieldToOptionalNumber(fields["点赞量"]),
      saves: fieldToOptionalNumber(fields["收藏量"]),
      comments: fieldToOptionalNumber(fields["评论量"]),
      shares: fieldToOptionalNumber(fields["分享量"]),
    },
  };
}

export function mapBloggerSampleToFeishuFields(sample: BloggerSample): Record<string, unknown> {
  return {
    "笔记ID": sample.id,
    "账号ID": sample.bloggerId,
    "标题": sample.title,
    "正文": sample.content,
    "话题标签": sample.tags.join(" "),
    "封面描述": sample.coverDescription || "",
  };
}
