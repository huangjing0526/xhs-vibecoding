#!/usr/bin/env node
/**
 * 幂等建表：对标账号 / 对标笔记 / 拆片记录三张飞书表。
 *
 * 三种情况各自处理：
 * ① 环境变量没配 → 表还不存在，建表并打印 table_id，由人填进 .env.local（脚本不改 .env）
 * ② 环境变量已配、列齐 → 什么都不做
 * ③ 环境变量已配、缺列 → 只补缺的列，不碰、不删、不改现有列
 *
 * 默认 dry-run，加 --apply 才真写（与 daoku:dedup 同约定）。
 *
 * 列全部建「多行文本」/「数字」，**枚举值也用文本**：飞书对未预设的单选项是拒绝整条写入
 * （FieldNameNotFound），docs/content-workbench-refactor-plan.md 的「飞书 schema 修复」记过这个事故。
 *
 * ⚠ 下面这份列清单与 lib/blogger.ts 的 map/normalize 函数是**两份手抄**，不是单一来源
 * （.mjs 引不了 TS）。两边改任一处都必须同步改另一处：这里漏一列 → 建表少列 →
 * 之后所有 writeBack 被飞书整条拒绝，而 tsc 与 next build 都抓不到，只有真跑写入才暴露。
 * 注意与 scripts/daoku/gen-write.mjs 的区别：那个脚本是字段透传（新字段随 JSON 自动带上），
 * 一句「手工同步」就够；本文件是穷举清单，漏项会静默生效，风险高一档。
 */
import { feishu, getAppToken, TABLE_ENV } from "../daoku/_feishu.mjs";

const TEXT = 1;
const NUMBER = 2;

const t = (name) => ({ field_name: name, type: TEXT });
const n = (name) => ({ field_name: name, type: NUMBER });

/** 表定义。fields[0] 是主键列（飞书索引列，必须是文本）。 */
const TABLES = [
  {
    key: "blogger",
    name: "对标账号",
    fields: [
      t("账号ID"),
      t("昵称"),
      t("平台"),
      t("主页链接"),
      t("定位"),
      t("简介"),
      n("粉丝数"),
      n("作品数"),
      t("状态"),
      t("最近采集时间"),
      // 道库蒸馏结果，分列存不存 JSON blob——这张表是给人读和改的
      t("核心道"),
      t("选题道"),
      t("标题范式"),
      t("正文范式"),
      t("视觉范式"),
      t("语气规则"),
      t("边界"),
      t("迁移备注"),
    ],
  },
  {
    key: "bloggerNote",
    name: "对标笔记",
    fields: [
      t("笔记ID"),
      t("账号ID"),
      t("标题"),
      t("正文"),
      t("话题标签"),
      t("封面描述"),
      t("链接"),
      t("发布时间"),
      n("阅读量"),
      n("点赞量"),
      n("收藏量"),
      n("评论量"),
      n("分享量"),
      // 以下为 lib/viralSignals.ts 的打分产物
      t("内容类型"),
      t("信息密度"),
      n("病毒潜力分"),
      t("命中信号"),
      t("钩子句"),
      t("打分说明"),
      n("互动率"),
    ],
  },
  {
    key: "videoExtract",
    name: "拆片记录",
    fields: [
      t("拆片ID"),
      t("拆片时间"),
      t("平台"),
      // 视频页地址，不是本地服务的 /out/xxx.mp4——那个是临时文件，见 lib/videoExtract.ts 的说明
      t("视频链接"),
      t("标题"),
      t("作者"),
      n("时长秒"),
      t("平台文案"),
      t("口播脚本"),
      // 以下为 AI 拆出的脚本结构
      t("钩子"),
      t("分段结构"),
      t("风格"),
      t("可复用模板"),
      t("痛点"),
      n("病毒潜力分"),
      t("打分说明"),
    ],
  },
];

const apply = process.argv.includes("--apply");

async function listFieldNames(appToken, tableId, key) {
  const names = new Set();
  let pageToken;
  do {
    const q = new URLSearchParams({ page_size: "100" });
    if (pageToken) q.set("page_token", pageToken);
    const data = await feishu(
      "GET",
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields?${q}`,
      undefined,
      `fields.list.${key}`
    );
    for (const item of data.items || []) names.add(item.field_name);
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);
  return names;
}

async function createTable(appToken, table) {
  if (!apply) {
    console.log(`  [dry-run] 将新建表「${table.name}」，含 ${table.fields.length} 列`);
    return;
  }
  const data = await feishu(
    "POST",
    `/open-apis/bitable/v1/apps/${appToken}/tables`,
    { table: { name: table.name, fields: table.fields } },
    `table.create.${table.key}`
  );
  console.log(`  已新建表「${table.name}」`);
  console.log(`  → 请把这行加进 .env.local：${TABLE_ENV[table.key]}=${data.table_id}`);
}

async function ensureFields(appToken, tableId, table) {
  const existing = await listFieldNames(appToken, tableId, table.key);
  const missing = table.fields.filter((field) => !existing.has(field.field_name));

  if (!missing.length) {
    console.log(`  列已齐全（${existing.size} 列），无需改动`);
    return;
  }

  console.log(`  缺 ${missing.length} 列：${missing.map((f) => f.field_name).join("、")}`);
  if (!apply) {
    console.log("  [dry-run] 未写入。确认无误后加 --apply 执行");
    return;
  }

  // 逐个建、不并发：飞书按创建顺序决定列在表里的先后，而这两张表是给人读和改的，
  // Promise.all 会把 20 列打乱成到达顺序。顺序执行还能失败即停、留下一个确定的前缀，重跑即愈。
  for (const field of missing) {
    await feishu(
      "POST",
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
      field,
      `field.create.${table.key}.${field.field_name}`
    );
    console.log(`  + ${field.field_name}`);
  }
}

async function main() {
  const appToken = getAppToken();
  console.log(apply ? "模式：apply（会真写飞书）" : "模式：dry-run（只看差异，不写）");

  for (const table of TABLES) {
    const envName = TABLE_ENV[table.key];
    const tableId = process.env[envName];
    console.log(`\n[${table.name}] ${envName}`);

    if (!tableId) {
      console.log("  环境变量未配置，视为表不存在");
      await createTable(appToken, table);
      continue;
    }

    await ensureFields(appToken, tableId, table);
  }

  if (!apply) console.log("\n以上为 dry-run 结果，加 --apply 执行。");
}

main().catch((error) => {
  console.error(`建表失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
