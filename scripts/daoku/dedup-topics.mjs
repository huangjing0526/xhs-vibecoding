#!/usr/bin/env node
/**
 * 选题表去重：按「内容全同」分簇，每簇留 1 条（质量分最高的），删掉其余重复。
 *
 * 为什么不按 选题ID 去重：选题ID 不可靠，同一个 ID 可能挂着完全不同的内容
 * （实测 TOPIC-20231027-001 同时是 FieldConfig 审计 5/10 和 Agent 分工表 8/10）。
 * 按 ID 去重会误删好选题。这里只把「标题+痛点+资产+来源」四项**全同**的当重复，最保守。
 *
 * 删飞书记录是破坏性操作（飞书回收站可恢复）。默认 --dry-run 只看不删，确认无误再加 --apply。
 * 用法：
 *   node scripts/daoku/dedup-topics.mjs              # 默认 dry-run，列出会删哪些
 *   node scripts/daoku/dedup-topics.mjs --apply      # 真删
 */
import { searchTopicRecords, deleteTopicRecord, fieldToText } from "./_feishu.mjs";

const apply = process.argv.slice(2).includes("--apply");

/** 折叠空白，做内容签名用 */
function norm(s) {
  return fieldToText(s).replace(/\s+/g, " ").trim();
}

/** 四项内容签名：标题 + 痛点 + 资产 + 来源 全同才算重复 */
function contentSignature(fields) {
  return [
    norm(fields["标题候选"]),
    norm(fields["读者痛点"]),
    norm(fields["可收藏资产"]),
    norm(fields["来源素材"]),
  ].join("");
}

/** "8/10" → 8；空/非法 → -1（没分的排最后，优先被删） */
function scoreOf(fields) {
  const m = fieldToText(fields["质量分"]).match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : -1;
}

const records = await searchTopicRecords();
const groups = new Map();
for (const rec of records) {
  const sig = contentSignature(rec.fields || {});
  if (!groups.has(sig)) groups.set(sig, []);
  groups.get(sig).push(rec);
}

const toDelete = [];
let dupClusters = 0;
for (const cluster of groups.values()) {
  if (cluster.length < 2) continue;
  dupClusters++;
  // 留质量分最高的；同分留 record_id 字典序最小的（稳定）
  cluster.sort((a, b) => {
    const ds = scoreOf(b.fields) - scoreOf(a.fields);
    return ds !== 0 ? ds : a.record_id.localeCompare(b.record_id);
  });
  const keeper = cluster[0];
  const title = norm(keeper.fields["标题候选"]) || norm(keeper.fields["核心观点"]) || keeper.record_id;
  console.log(`\n簇（${cluster.length} 条重复）: ${title.slice(0, 40)}`);
  console.log(`  留: ${keeper.record_id} (质量分 ${fieldToText(keeper.fields["质量分"]) || "无"})`);
  for (const rec of cluster.slice(1)) {
    console.log(`  删: ${rec.record_id} (质量分 ${fieldToText(rec.fields["质量分"]) || "无"})`);
    toDelete.push(rec.record_id);
  }
}

if (toDelete.length === 0) {
  console.log("没有发现内容全同的重复，无需去重。");
  process.exit(0);
}

console.log(`\n共 ${dupClusters} 簇重复，将删 ${toDelete.length} 条（总 ${records.length} → ${records.length - toDelete.length}）`);

if (!apply) {
  console.log("\n[dry-run] 未真删。确认无误后加 --apply 执行：node scripts/daoku/dedup-topics.mjs --apply");
  process.exit(0);
}

let ok = 0;
let fail = 0;
for (const recordId of toDelete) {
  try {
    await deleteTopicRecord(recordId);
    console.log(`[ok] 已删 ${recordId}`);
    ok++;
  } catch (e) {
    console.error(`[fail] ${recordId}：${e.message}`);
    fail++;
  }
}
console.log(`\n汇总：已删 ${ok} · 失败 ${fail}（飞书回收站可恢复）`);
if (fail > 0) process.exit(1);
