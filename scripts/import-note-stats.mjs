/**
 * 把小红书创作服务平台导出的「笔记列表明细表.xlsx」导入飞书复盘表。
 * 整条导入在 lib/noteStats.mjs，复盘页的「导入数据」用的是同一份，这里只注入脚本自己的飞书客户端。
 *
 * 导出路径：creator.xiaohongshu.com > 数据看板 > 笔记数据 > 导出数据
 *
 * 同一篇笔记重复导入是更新那一行（数据是累计值，新一期直接覆盖）；
 * 工作台里「标记发布」过的笔记按标题认领，数据回填到发布时建的那一行。
 *
 * 用法：
 *   node scripts/import-note-stats.mjs ~/Downloads/笔记列表明细表.xlsx --dry-run
 *   node scripts/import-note-stats.mjs ~/Downloads/笔记列表明细表.xlsx
 */
import { readFileSync } from "node:fs";
import { batchUpdateRecords, createRecords, searchRecords, fieldToText } from "./daoku/_feishu.mjs";
import { importNoteStats } from "../lib/noteStats.mjs";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const filePath = args.find((arg) => !arg.startsWith("--"));

  if (!filePath) {
    console.error("用法：node scripts/import-note-stats.mjs <笔记列表明细表.xlsx> [--dry-run]");
    process.exit(1);
  }

  const { records, existingCount, updates, creates } = await importNoteStats(
    readFileSync(filePath),
    {
      searchReviewRecords: () => searchRecords("review"),
      fieldToText,
      batchUpdate: (rows) => batchUpdateRecords("review", rows),
      batchCreate: (rows) => createRecords("review", rows),
    },
    { dryRun }
  );

  console.log(`解析 ${records.length} 条笔记，飞书复盘表已有 ${existingCount} 条记录`);
  console.log(`更新 ${updates.length} 条，新建 ${creates.length} 条`);
  for (const { item, linkedNoteId } of updates) {
    console.log(`  更新  ${item.date}  阅读 ${String(item.fields.阅读量).padStart(4)}  ${item.title || "(无标题)"}${linkedNoteId ? `  → ${linkedNoteId}` : ""}`);
  }
  for (const { item } of creates) {
    console.log(`  新建  ${item.date}  阅读 ${String(item.fields.阅读量).padStart(4)}  ${item.title || "(无标题)"}`);
  }
  console.log(dryRun ? "\n--dry-run：以上改动未写入" : "导入完成");
}

main().catch((error) => {
  console.error("[import-note-stats] 导入失败", { file: process.argv[2], error: error.message });
  process.exit(1);
});
