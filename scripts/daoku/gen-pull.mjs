#!/usr/bin/env node
/**
 * 内容生成「拉输入」：把某一步要给 Claude 的输入从飞书拉成 JSON。
 * 生成由 Claude 在会话里按 lib/xhsWorkflow.ts 同款 prompt 跑（单一来源），再用 gen-write 写回。
 *
 *   node scripts/daoku/gen-pull.mjs materials   # 素材：列已存在的素材ID（供我读本地日报后去重）
 *   node scripts/daoku/gen-pull.mjs topics      # 选题：拉可用素材+术语+已存在选题ID
 *   node scripts/daoku/gen-pull.mjs drafts       # 草稿：拉选题卡+已存在笔记ID
 *
 * 可选 --status=xxx 过滤；--out=file 落文件。
 */
import { writeFileSync } from "node:fs";
import { searchRecords, fieldToText } from "./_feishu.mjs";

const args = process.argv.slice(2);
const stage = args.find((a) => !a.startsWith("--"));
const statusFilter = (args.find((a) => a.startsWith("--status=")) || "").split("=")[1] || "";
const outFile = (args.find((a) => a.startsWith("--out=")) || "").split("=")[1] || "";

const STAGES = ["materials", "topics", "drafts"];
if (!STAGES.includes(stage)) {
  console.error(`用法: node scripts/daoku/gen-pull.mjs <${STAGES.join("|")}> [--status=xxx] [--out=file]`);
  process.exit(1);
}

const t = (rec, name) => fieldToText((rec.fields || {})[name]);
const byStatus = (rec) => !statusFilter || t(rec, "状态") === statusFilter;

let payload;

if (stage === "materials") {
  // 素材由 Claude 读本地开发日报/问题记录智能提炼；这里只给「已存在素材ID」防重 + 字段规格
  const materials = await searchRecords("material");
  payload = {
    stage,
    existingSourceIds: materials.map((r) => t(r, "素材ID")).filter(Boolean),
    guide: {
      读什么: "TarmeerCRM 的开发日报/问题记录（docs/06-协作记录/reports/daily|issues/），由 Claude 读原文",
      产出字段: ["素材ID", "来源类型", "日期(YYYY-MM-DD)", "原文摘要", "核心事件", "踩坑点", "可复用方法", "关联术语"],
      素材ID规则: "日报=DAILY-<date>[-NN] / 问题=ISSUE-<date>-<code> / 标准文档=STD-<hash>",
      来源类型: "开发日报 / 开发周报 / 问题记录 / AI协作标准 / 协作流程",
      写回: "gen-write material <file.json>（按素材ID去重）",
    },
  };
} else if (stage === "topics") {
  // 选题输入 = 可用素材 + 术语 + 已存在选题ID/来源（防重）
  const [materials, glossary, topics] = await Promise.all([
    searchRecords("material"),
    searchRecords("glossary"),
    searchRecords("topic"),
  ]);
  payload = {
    stage,
    materials: materials.filter(byStatus).map((r) => ({
      素材ID: t(r, "素材ID"),
      来源类型: t(r, "来源类型"),
      原文摘要: t(r, "原文摘要"),
      核心事件: t(r, "核心事件"),
      踩坑点: t(r, "踩坑点"),
      可复用方法: t(r, "可复用方法"),
      关联术语: t(r, "关联术语"),
      状态: t(r, "状态"),
    })),
    glossary: glossary.map((r) => ({
      术语: t(r, "术语"),
      解释: t(r, "一句话解释"),
      可收藏资产: t(r, "可收藏资产"),
    })),
    existingTopicIds: topics.map((r) => t(r, "选题ID")).filter(Boolean),
    guide: {
      prompt单一来源: "lib/xhsWorkflow.ts buildContentCardPrompt（按它的内容原则+JSON格式生成）",
      语气分档: "lib/daoku.ts DAOKU_TONE",
      目标清单: "每条选题必须带「目标清单」字段=打算投的发布目标（\\n 连接）。当前只有 xhs-post，就填 xhs-post。取值对齐 lib/targets.ts 的 TargetId。",
      写回: "gen-write topic <file.json>（按内容去重，可加 --mark-materials 把已用素材标已提炼）",
    },
  };
} else if (stage === "drafts") {
  // 草稿输入 = 选题卡（默认偏爆/中性优先，自己挑）+ 已存在笔记ID
  const [topics, drafts] = await Promise.all([
    searchRecords("topic"),
    searchRecords("draft"),
  ]);
  payload = {
    stage,
    topics: topics.filter(byStatus).map((r) => ({
      选题ID: t(r, "选题ID"),
      标题候选: t(r, "标题候选"),
      读者痛点: t(r, "读者痛点"),
      核心观点: t(r, "核心观点"),
      真实案例: t(r, "真实案例"),
      可收藏资产: t(r, "可收藏资产"),
      正文结构: t(r, "正文结构"),
      质量分: t(r, "质量分"),
      偏爆偏哑: t(r, "偏爆偏哑"),
      状态: t(r, "状态"),
      目标清单: t(r, "目标清单"),
    })),
    existingNoteIds: drafts.map((r) => t(r, "笔记ID")).filter(Boolean),
    guide: {
      prompt单一来源: "lib/xhsWorkflow.ts buildDraftPrompt（正文≤200中文字符，无营销腔，给可收藏资产）",
      建议: "优先给偏爆/质量分高的选题起草；可叠 distill-blogger 审稿质检",
      每篇一个目标: "为选题「目标清单」里的每个目标各起一篇草稿，草稿带「发布目标」字段=该目标。",
      笔记ID格式: "笔记ID = NOTE-<YYYYMMDD>-<选题ID后3位>-<发布目标>，对齐 lib/xhsWorkflow.ts 的 makeNoteId。带目标后缀，否则同选题多目标的复盘会互相覆盖。",
      写回: "gen-write draft <file.json>（按笔记ID去重）",
    },
  };
}

const json = JSON.stringify(payload, null, 2);
if (outFile) {
  writeFileSync(outFile, json);
  console.error(`[gen-pull:${stage}] → ${outFile}`);
} else {
  console.log(json);
}
