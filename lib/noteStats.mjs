/**
 * 小红书创作服务平台「笔记列表明细表.xlsx」→ 飞书复盘表。
 * 命令行脚本（scripts/import-note-stats.mjs）和复盘页的「导入数据」共用这一份，纯 JS 好让两边都能直接 import。
 *
 * 导出路径：creator.xiaohongshu.com > 数据看板 > 笔记数据 > 导出数据
 * 为什么自己解析 xlsx：项目不装 xlsx 依赖。这份导出的结构很固定（inlineStr + 数值、无 sharedStrings），
 * 一个最小 zip + XML 读取足够。
 */
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";

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

function readXlsxRows(buf) {
  const entries = readZipEntries(buf);
  const sheet = entries.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("xlsx 里找不到 xl/worksheets/sheet1.xml");
  return parseSheet(readZipEntry(buf, sheet).toString("utf8"));
}

// —— 导出表 → 飞书复盘表字段 ——

/** 解析真正会读的列，缺任何一列都说明导出格式变了 */
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

/**
 * 解析导出表。返回每篇笔记一条：noteId 由「发布日期 + 标题」生成（导出表没有笔记ID），fields 直接是复盘表字段。
 * @param {Buffer} buf
 * @returns {Array<{ noteId: string, date: string, title: string, fields: Record<string, unknown> }>}
 */
export function parseNoteStatsXlsx(buf) {
  return toRecords(readXlsxRows(buf));
}

// —— 导入 → 复盘表：哪些更新、哪些新建 ——

/** 去空白和大小写再比，标题里多一个空格不该对不上 */
function normalizeTitle(title) {
  return String(title || "").replace(/\s+/g, "").toLowerCase();
}

/**
 * 两个标题是不是同一篇。小红书标题上限 20 字，发出去可能被截短，所以短的是长的前缀也算；
 * 不分哪边是导出、哪边是草稿，导入和「标记发布」两个方向都能用。太短的前缀（< 6 字）不算，免得误配。
 */
export function titlesMatch(a, b) {
  const [shorter, longer] = [normalizeTitle(a), normalizeTitle(b)].sort((x, y) => x.length - y.length);
  if (!shorter) return false;
  return shorter === longer || (shorter.length >= 6 && longer.startsWith(shorter));
}

/** 工作台「标记发布」建的复盘行，笔记ID 是 makeNoteId 的格式 */
export function isWorkbenchNoteId(noteId) {
  return String(noteId || "").startsWith("NOTE-");
}

/**
 * 复盘表原始记录 → 认领要用的三样。fieldToText 由调用方传：页面和脚本各有一个飞书客户端。
 * @param {{ record_id: string, fields?: Record<string, unknown> }} record
 * @param {(value: unknown) => string} fieldToText
 */
export function toReviewRow(record, fieldToText) {
  return {
    recordId: record.record_id,
    noteId: fieldToText(record.fields?.["笔记ID"]),
    title: fieldToText(record.fields?.["标题"] ?? record.fields?.["笔记标题"]),
  };
}

/**
 * 认领规则，导入与「标记发布」两头共用：同一笔记ID 直接认；否则在 isCandidate 圈定的行里，
 * 标题唯一对上的那条才认，对上不止一条不猜。
 * @param {Array<{ recordId: string, noteId: string, title: string }>} rows
 * @param {(row: { noteId: string }) => boolean} isCandidate
 */
export function findClaimableRow(rows, noteId, title, isCandidate) {
  const sameId = rows.find((row) => row.noteId === noteId);
  if (sameId) return sameId;
  const matches = rows.filter((row) => isCandidate(row) && titlesMatch(title, row.title));
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * 决定每条导入记录写到哪：同一笔记ID → 更新（数是累计值，直接覆盖）；标题唯一对上工作台发布的行 →
 * 更新那一行，保留它的笔记ID和标题，草稿那头才连得上；都没有 → 新建。
 * @param {ReturnType<typeof toReviewRow>[]} existing
 * @param {ReturnType<typeof parseNoteStatsXlsx>} imported
 */
export function planNoteStatsUpsert(existing, imported) {
  const updates = [];
  const creates = [];
  for (const item of imported) {
    const row = findClaimableRow(existing, item.noteId, item.title, (candidate) => isWorkbenchNoteId(candidate.noteId));
    if (!row) {
      creates.push({ item, fields: item.fields });
    } else if (row.noteId === item.noteId) {
      updates.push({ recordId: row.recordId, item, fields: item.fields });
    } else {
      const { 笔记ID: _noteId, 标题: _title, ...metricFields } = item.fields;
      updates.push({ recordId: row.recordId, item, fields: metricFields, linkedNoteId: row.noteId });
    }
  }
  return { updates, creates };
}

/** 飞书单次批量上限：更新 1000、新建 500 */
const UPDATE_BATCH = 1000;
const CREATE_BATCH = 500;

/**
 * 整条导入：解析 → 读复盘表 → 定计划 → 写。页面路由和命令行脚本都走这里，只注入各自的飞书客户端。
 * @param {Buffer} buf
 * @param {{
 *   searchReviewRecords: () => Promise<Array<{ record_id: string, fields?: Record<string, unknown> }>>,
 *   fieldToText: (value: unknown) => string,
 *   batchUpdate: (records: Array<{ record_id: string, fields: Record<string, unknown> }>) => Promise<unknown>,
 *   batchCreate: (records: Array<{ fields: Record<string, unknown> }>) => Promise<unknown>,
 * }} client
 * @param {{ dryRun?: boolean }} [options]
 */
export async function importNoteStats(buf, client, options = {}) {
  const records = parseNoteStatsXlsx(buf);
  if (!records.length) {
    throw new Error("导出表里没有笔记，确认导出的是「笔记数据」而不是直播数据");
  }
  const existing = (await client.searchReviewRecords()).map((record) => toReviewRow(record, client.fieldToText));
  const plan = planNoteStatsUpsert(existing, records);

  if (!options.dryRun) {
    for (let index = 0; index < plan.updates.length; index += UPDATE_BATCH) {
      await client.batchUpdate(
        plan.updates.slice(index, index + UPDATE_BATCH).map(({ recordId, fields }) => ({ record_id: recordId, fields }))
      );
    }
    for (let index = 0; index < plan.creates.length; index += CREATE_BATCH) {
      await client.batchCreate(plan.creates.slice(index, index + CREATE_BATCH).map(({ fields }) => ({ fields })));
    }
  }
  return { records, existingCount: existing.length, ...plan };
}
