#!/usr/bin/env node
/**
 * 第1步：从飞书选题表拉「待评分」候选 → JSON（给 Claude 跑道库评审）。
 *
 * 默认只拉「质量分为空」的（没评过的）。用法：
 *   node scripts/daoku/pull-topics.mjs                 # 待评分的 → stdout
 *   node scripts/daoku/pull-topics.mjs --all           # 全部（含已评分，用于重评）
 *   node scripts/daoku/pull-topics.mjs --status=待写    # 只看某状态
 *   node scripts/daoku/pull-topics.mjs --out=topics.json
 */
import { writeFileSync } from "node:fs";
import { searchTopicRecords, fieldToText } from "./_feishu.mjs";

const args = process.argv.slice(2);
const all = args.includes("--all");
const statusFilter = (args.find((a) => a.startsWith("--status=")) || "").split("=")[1] || "";
const outFile = (args.find((a) => a.startsWith("--out=")) || "").split("=")[1] || "";

function cardToTopic(fields) {
  const titles = fieldToText(fields["标题候选"])
    .split(/\n|、/)
    .map((s) => s.trim())
    .filter(Boolean);
  const topicId = fieldToText(fields["选题ID"]);
  return {
    topicId,
    title: titles[0] || fieldToText(fields["核心观点"]) || topicId,
    painPoint: fieldToText(fields["读者痛点"]) || undefined,
    asset: fieldToText(fields["可收藏资产"]) || undefined,
    source: fieldToText(fields["来源素材"]) || undefined,
  };
}

const records = await searchTopicRecords();
const candidates = [];
for (const rec of records) {
  const f = rec.fields || {};
  const status = fieldToText(f["状态"]);
  const currentScore = fieldToText(f["质量分"]);
  if (statusFilter && status !== statusFilter) continue;
  if (!all && currentScore) continue; // 已评分跳过，除非 --all
  candidates.push({
    recordId: rec.record_id,
    ...cardToTopic(f),
    status,
    currentScore: currentScore || null,
  });
}

const payload = {
  pulledAt: new Date().toISOString(),
  count: candidates.length,
  hint: "把这份交给 Claude，按 lib/daoku.ts 道库标准逐条打分，产出 [{recordId, score(0-10), hitDao, verdict(偏爆/中性/偏哑), reasons?, fixes?}]，再用 daoku:write 写回飞书",
  candidates,
};
const json = JSON.stringify(payload, null, 2);
if (outFile) {
  writeFileSync(outFile, json);
  console.error(`[pull] ${candidates.length} 条待评分 → ${outFile}`);
} else {
  console.log(json);
}
