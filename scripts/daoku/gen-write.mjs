#!/usr/bin/env node
/**
 * 内容生成「写回飞书」：把 Claude 生成的记录写进对应表，写前按表去重。
 *
 *   node scripts/daoku/gen-write.mjs material <file.json> [--dry-run]
 *   node scripts/daoku/gen-write.mjs topic    <file.json> [--mark-materials] [--dry-run]
 *   node scripts/daoku/gen-write.mjs draft    <file.json> [--dry-run]
 *
 * 输入 JSON：数组 [{fields:{...飞书列名...}}]，或 {records:[...]} 包一层。
 * 字段列名与状态值均以 lib/xhsWorkflow.ts 为单一来源（mapXxxToFeishuFields / MATERIAL_STATUS
 * 等常量），由 Claude 生成时对齐。本脚本是 .mjs 且要能脱离 dev server 独立跑，引不了那边的
 * TS 常量，因此这里的对应字面量必须手工同步——改动那些常量时一并搜这个目录。
 * 去重键：material=素材ID / topic=内容签名(标题+痛点+资产+来源) / draft=笔记ID。
 */
import { readFileSync } from "node:fs";
import { searchRecords, createRecords, updateRecord, fieldToText } from "./_feishu.mjs";

/** 对应 lib/xhsWorkflow.ts 的 MATERIAL_STATUS.extracted。 */
const MATERIAL_STATUS_EXTRACTED = "已提炼";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const markMaterials = args.includes("--mark-materials");
const positional = args.filter((a) => !a.startsWith("--"));
const table = positional[0];
const file = positional[1];

const TABLES = ["material", "topic", "draft"];
if (!TABLES.includes(table) || !file) {
  console.error(`用法: node scripts/daoku/gen-write.mjs <${TABLES.join("|")}> <file.json> [--mark-materials] [--dry-run]`);
  process.exit(1);
}

let records;
try {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  records = Array.isArray(raw) ? raw : raw.records || raw.cards || raw.materials || raw.drafts;
} catch (e) {
  console.error(`读取/解析 ${file} 失败：${e.message}`);
  process.exit(1);
}
if (!Array.isArray(records) || records.length === 0) {
  console.error("没有可写的记录（期望数组 [{fields:{...}}]）");
  process.exit(1);
}
// 统一成 {fields}
records = records.map((r) => (r && r.fields ? r : { fields: r }));

const norm = (s) => fieldToText(s).replace(/\s+/g, " ").trim();
const f = (rec, name) => norm((rec.fields || {})[name]);

/** 每张表的去重键 */
function keyOf(rec) {
  if (table === "material") return f(rec, "素材ID");
  if (table === "draft") return f(rec, "笔记ID");
  // topic：内容签名
  return [f(rec, "标题候选"), f(rec, "读者痛点"), f(rec, "可收藏资产"), f(rec, "来源素材")].join("");
}

const existing = await searchRecords(table);
const existingKeys = new Set(
  existing.map((rec) => {
    if (table === "material") return norm(fieldToText(rec.fields?.["素材ID"]));
    if (table === "draft") return norm(fieldToText(rec.fields?.["笔记ID"]));
    return ["标题候选", "读者痛点", "可收藏资产", "来源素材"]
      .map((n) => norm(fieldToText(rec.fields?.[n])))
      .join("");
  })
);

const toCreate = [];
const seen = new Set();
let skipped = 0;
for (const rec of records) {
  const key = keyOf(rec);
  if (key && (existingKeys.has(key) || seen.has(key))) {
    console.error(`跳过重复：${key.slice(0, 60)}`);
    skipped++;
    continue;
  }
  if (key) seen.add(key);
  toCreate.push(rec);
}

console.error(`待写 ${records.length} 条 → 去重后 ${toCreate.length} 条（跳过 ${skipped}）`);
for (const rec of toCreate) {
  console.log(`[+] ${keyOf(rec).slice(0, 60) || "(无键)"}`);
}

if (toCreate.length === 0) {
  console.error("没有需要新建的记录。");
  process.exit(0);
}

if (dryRun) {
  console.error("\n[dry-run] 未写入。确认后去掉 --dry-run 执行。");
  process.exit(0);
}

const result = await createRecords(table, toCreate);
const createdCount = result?.records?.length ?? toCreate.length;
console.error(`\n[ok] 已写入 ${createdCount} 条到 ${table} 表`);

// topic 可选：把被引用的素材标「已提炼」
if (table === "topic" && markMaterials) {
  const usedSourceIds = new Set();
  for (const rec of toCreate) {
    f(rec, "来源素材")
      .split(/[、,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => usedSourceIds.add(s));
  }
  const materials = await searchRecords("material");
  let marked = 0;
  for (const m of materials) {
    const sid = norm(fieldToText(m.fields?.["素材ID"]));
    // "已提炼" 必须等于 lib/xhsWorkflow.ts 的 MATERIAL_STATUS.extracted，见文件头。
    if (sid && usedSourceIds.has(sid) && fieldToText(m.fields?.["状态"]) !== MATERIAL_STATUS_EXTRACTED) {
      await updateRecord("material", m.record_id, { 状态: MATERIAL_STATUS_EXTRACTED });
      marked++;
    }
  }
  console.error(`[ok] 标记 ${marked} 条素材为「已提炼」`);
}
