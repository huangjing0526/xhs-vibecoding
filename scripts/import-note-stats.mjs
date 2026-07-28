/**
 * 把小红书创作服务平台导出的「笔记列表明细表.xlsx」导入飞书复盘表。
 *
 * 导出路径：creator.xiaohongshu.com > 数据看板 > 笔记数据 > 导出数据
 *
 * 为什么自己解析 xlsx：项目不装 xlsx 依赖（要打包进 Cloudflare Workers）。
 * 这份导出的结构很固定（inlineStr + 数值、无 sharedStrings），一个最小 zip + XML 读取足够。
 *
 * 导出文件里没有笔记ID，只有标题，所以用「发布日期 + 标题」生成稳定 ID，
 * 重复导入同一批笔记不会产生重复记录（新一期数据仍会追加）。
 *
 * 用法：
 *   node scripts/import-note-stats.mjs ~/Downloads/笔记列表明细表.xlsx --dry-run
 *   node scripts/import-note-stats.mjs ~/Downloads/笔记列表明细表.xlsx
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createRecords, searchRecords, fieldToText } from "./daoku/_feishu.mjs";

// —— 最小 zip 读取（只够读 xlsx，不支持加密 / zip64）——

function readZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("不是合法的 xlsx 文件（未找到 zip 结尾标记）");

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`xlsx 的 zip 中心目录损坏（第 ${i + 1} 项）`);
    }
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength);
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(buf, entry) {
  const nameLength = buf.readUInt16LE(entry.localOffset + 26);
  const extraLength = buf.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const data = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`xlsx 使用了不支持的压缩方式 ${entry.method}`);
}

// —— sheet XML → 行数组 ——

const XML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXml(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m]);
}

/** 列号 "AB12" → 0-based 列索引 */
function columnIndex(ref) {
  const letters = ref.replace(/\d+$/, "");
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

function parseSheet(xml) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row[^>]*>(.*?)<\/row>/gs)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\s+r="([A-Z]+\d+)"([^>]*)>(.*?)<\/c>/gs)) {
      const [, ref, attrs, body] = cellMatch;
      const inline = body.match(/<t[^>]*>(.*?)<\/t>/s);
      const numeric = body.match(/<v>(.*?)<\/v>/s);
      let value = null;
      if (inline) value = decodeXml(inline[1]);
      else if (numeric) {
        const raw = decodeXml(numeric[1]);
        value = /t="(n|str)"/.test(attrs) || !Number.isNaN(Number(raw)) ? Number(raw) : raw;
      }
      cells[columnIndex(ref)] = value;
    }
    rows.push(cells);
  }
  return rows;
}

function readXlsxRows(filePath) {
  const buf = readFileSync(filePath);
  const entries = readZipEntries(buf);
  const sheet = entries.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("xlsx 里找不到 xl/worksheets/sheet1.xml");
  return parseSheet(readZipEntry(buf, sheet).toString("utf8"));
}

// —— 导出表 → 飞书复盘表字段 ——

/** 脚本真正会读的列，缺任何一列都说明导出格式变了 */
const HEADERS = [
  "笔记标题",
  "首次发布时间",
  "体裁",
  "曝光",
  "观看量",
  "封面点击率",
  "点赞",
  "评论",
  "收藏",
  "涨粉",
  "分享",
];

/** 表头可能整体下移（首行是「最多导出排序后前1000条笔记」提示），按内容定位 */
function locateHeader(rows) {
  const index = rows.findIndex(
    (row) => row.includes("笔记标题") && row.includes("首次发布时间") && row.includes("曝光")
  );
  if (index === -1) {
    throw new Error(`xlsx 里找不到表头行（期望包含：${HEADERS.slice(0, 6).join(" / ")}）`);
  }
  const header = rows[index].map((cell) => (typeof cell === "string" ? cell.trim() : ""));
  const missing = HEADERS.filter((name) => !header.includes(name));
  if (missing.length) {
    throw new Error(`导出表缺少字段：${missing.join("、")}（小红书可能改了导出格式）`);
  }
  return { headerIndex: index, header };
}

/** "2026年07月12日00时42分09秒" → { date: "2026-07-12", timestamp } */
function parsePublishTime(text) {
  const m = String(text).match(/(\d{4})年(\d{2})月(\d{2})日(?:(\d{2})时(\d{2})分(\d{2})秒)?/);
  if (!m) return null;
  const [, y, mo, d, hh = "00", mm = "00", ss = "00"] = m;
  return {
    date: `${y}-${mo}-${d}`,
    timestamp: new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}+08:00`).getTime(),
  };
}

/** 导出表没有笔记ID，用「发布日期 + 标题」生成稳定 ID，供重复导入去重 */
function buildNoteId(date, title) {
  const digest = createHash("sha1").update(`${date}|${title}`).digest("hex").slice(0, 6);
  return `xhs-${date.replace(/-/g, "")}-${digest}`;
}

function toRecords(rows) {
  const { headerIndex, header } = locateHeader(rows);
  const pick = (row, name) => row[header.indexOf(name)];
  const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const records = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const published = parsePublishTime(pick(row, "首次发布时间"));
    if (!published) continue;

    const title = typeof pick(row, "笔记标题") === "string" ? pick(row, "笔记标题").trim() : "";
    const noteId = buildNoteId(published.date, title);
    const reads = num(pick(row, "观看量"));
    const likes = num(pick(row, "点赞"));
    const saves = num(pick(row, "收藏"));
    const comments = num(pick(row, "评论"));
    const shares = num(pick(row, "分享"));
    const interactions = likes + saves + comments + shares;
    const genre = pick(row, "体裁") === "视频" ? "视频" : "图文";

    records.push({
      noteId,
      date: published.date,
      title,
      fields: {
        笔记ID: noteId,
        标题: title,
        笔记标题: title,
        笔记类型: genre,
        发布时间: published.timestamp,
        曝光: num(pick(row, "曝光")),
        阅读量: reads,
        封面点击率: num(pick(row, "封面点击率")),
        点赞量: likes,
        评论量: comments,
        收藏量: saves,
        分享量: shares,
        涨粉: num(pick(row, "涨粉")),
        互动率: reads > 0 ? Number((interactions / reads).toFixed(4)) : 0,
        收藏率: reads > 0 ? Number((saves / reads).toFixed(4)) : 0,
      },
    });
  }

  return records;
}

// —— 主流程 ——

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const filePath = args.find((arg) => !arg.startsWith("--"));

  if (!filePath) {
    console.error("用法：node scripts/import-note-stats.mjs <笔记列表明细表.xlsx> [--dry-run]");
    process.exit(1);
  }

  const rows = readXlsxRows(filePath);
  const records = toRecords(rows);
  if (!records.length) {
    console.error("导出表里没有解析到任何笔记，请确认文件是「笔记数据」而非「直播场次数据」");
    process.exit(1);
  }

  const existing = await searchRecords("review");
  const existingIds = new Set(
    existing.map((item) => fieldToText(item.fields?.["笔记ID"])).filter(Boolean)
  );
  const fresh = records.filter((item) => !existingIds.has(item.noteId));
  const duplicated = records.length - fresh.length;

  console.log(`解析 ${records.length} 条笔记，飞书复盘表已有 ${existing.length} 条记录`);
  if (duplicated > 0) console.log(`跳过 ${duplicated} 条已导入的笔记（按笔记ID去重）`);

  if (!fresh.length) {
    console.log("没有新笔记需要导入");
    return;
  }

  for (const item of fresh) {
    console.log(
      `  ${item.date}  曝光 ${String(item.fields.曝光).padStart(5)}  阅读 ${String(item.fields.阅读量).padStart(4)}  ${item.title || "(无标题)"}`
    );
  }

  if (dryRun) {
    console.log(`\n--dry-run：以上 ${fresh.length} 条未写入`);
    return;
  }

  // 飞书批量写入单次上限 500 条
  for (let i = 0; i < fresh.length; i += 500) {
    const batch = fresh.slice(i, i + 500);
    await createRecords(
      "review",
      batch.map((item) => ({ fields: item.fields }))
    );
    console.log(`已写入 ${Math.min(i + batch.length, fresh.length)}/${fresh.length}`);
  }
  console.log("导入完成");
}

main().catch((error) => {
  console.error("[import-note-stats] 导入失败", { file: process.argv[2], error: error.message });
  process.exit(1);
});
