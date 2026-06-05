#!/usr/bin/env node
/**
 * 第3步：把 Claude 打好的道库分写回飞书选题表的 质量分 / 命中道 / 偏爆偏哑 三字段。
 *
 * 输入：JSON 文件，数组 [{recordId, score(0-10), hitDao, verdict(偏爆/中性/偏哑)}]，
 *       也接受 {scores:[...]} 或 {candidates:[...]} 包一层。
 * 用法：
 *   node scripts/daoku/write-scores.mjs scores.json --dry-run   # 先看不写
 *   node scripts/daoku/write-scores.mjs scores.json             # 真写回
 */
import { readFileSync } from "node:fs";
import { updateTopicRecord } from "./_feishu.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error("用法: node scripts/daoku/write-scores.mjs <scores.json> [--dry-run]");
  process.exit(1);
}

let scores;
try {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  scores = Array.isArray(raw) ? raw : raw.scores || raw.candidates;
} catch (e) {
  console.error(`读取/解析 ${file} 失败：${e.message}`);
  process.exit(1);
}
if (!Array.isArray(scores) || scores.length === 0) {
  console.error("没有可写回的评分（期望数组 [{recordId, score, hitDao, verdict}]）");
  process.exit(1);
}

const VERDICTS = new Set(["偏爆", "中性", "偏哑"]);
let ok = 0;
let fail = 0;
let skip = 0;

for (const s of scores) {
  const { recordId, score, verdict } = s;
  const hitDao = s.hitDao || "";
  if (!recordId) {
    console.error(`跳过：缺 recordId — ${JSON.stringify(s).slice(0, 80)}`);
    skip++;
    continue;
  }
  if (typeof score !== "number" || score < 0 || score > 10) {
    console.error(`跳过 ${recordId}：score 非法（${score}），应为 0-10 数字`);
    skip++;
    continue;
  }
  if (!VERDICTS.has(verdict)) {
    console.error(`跳过 ${recordId}：verdict 非法（${verdict}），应为 偏爆/中性/偏哑`);
    skip++;
    continue;
  }
  const fields = {
    质量分: `${score}/10`,
    命中道: hitDao || "（未命中道）",
    偏爆偏哑: verdict,
  };
  if (dryRun) {
    console.log(`[dry] ${recordId} ← ${JSON.stringify(fields)}`);
    ok++;
    continue;
  }
  try {
    await updateTopicRecord(recordId, fields);
    console.log(`[ok] ${recordId} ← 质量分 ${fields.质量分} / ${verdict} / ${fields.命中道}`);
    ok++;
  } catch (e) {
    console.error(`[fail] ${recordId}：${e.message}`);
    fail++;
  }
}

console.error(`\n汇总：成功 ${ok} · 失败 ${fail} · 跳过 ${skip}${dryRun ? " （dry-run 未真写）" : ""}`);
if (fail > 0) process.exit(1);
