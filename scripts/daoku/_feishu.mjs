/**
 * 道库脚本共用的飞书选题表读写小工具（自包含，零依赖）。
 *
 * 为什么不直接 import lib/feishu.ts：那是 TS + Next 别名（@/），跑起来要 tsx/ts-node。
 * 这里只忠实复刻「选题表的读 / 写 / 取文本」三件事，纯 .mjs 直接 node 跑，不需要先起 dev server。
 * 评分标准的单一来源仍是 lib/daoku.ts（本文件只管搬数据，不做判断）。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** 极简 .env 解析：KEY=VALUE，跳过注释/空行，已存在的 process.env 不覆盖 */
function loadEnvFile(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadEnvFile(resolve(PROJECT_ROOT, ".env.local"));
loadEnvFile(resolve(PROJECT_ROOT, ".env"));

const API_BASE = process.env.FEISHU_API_BASE || "https://open.feishu.cn";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`缺少环境变量 ${name}（检查 xhs-vibecoding/.env.local）`);
  return v;
}

let tokenCache = null;
async function getTenantToken() {
  if (tokenCache && tokenCache.expiresAt - Date.now() > 5 * 60 * 1000) {
    return tokenCache.token;
  }
  const res = await fetch(`${API_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      app_id: requireEnv("FEISHU_APP_ID"),
      app_secret: requireEnv("FEISHU_APP_SECRET"),
    }),
  });
  const data = await parseResponse(res, "getTenantToken");
  if (!data.tenant_access_token) throw new Error("飞书未返回 tenant_access_token");
  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + Math.max((data.expire || 7200) - 300, 60) * 1000,
  };
  return tokenCache.token;
}

async function parseResponse(res, action) {
  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`飞书响应解析失败 (${action}, status=${res.status})`);
  }
  if (!res.ok || payload.code !== 0) {
    throw new Error(`飞书接口失败 (${action})：${payload.msg || `HTTP ${res.status}`}`);
  }
  return payload.data ?? payload;
}

async function feishu(method, path, body, action) {
  const token = await getTenantToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse(res, action);
}

/** 表名 → 飞书 table_id 环境变量（与 lib/feishu.ts 一致） */
const TABLE_ENV = {
  material: "FEISHU_MATERIAL_TABLE_ID",
  glossary: "FEISHU_GLOSSARY_TABLE_ID",
  topic: "FEISHU_TOPIC_TABLE_ID",
  draft: "FEISHU_DRAFT_TABLE_ID",
  review: "FEISHU_REVIEW_TABLE_ID",
};

function tableRef(table) {
  const env = TABLE_ENV[table];
  if (!env) throw new Error(`未知表名 ${table}（应为 ${Object.keys(TABLE_ENV).join("/")}）`);
  return {
    appToken: requireEnv("FEISHU_BASE_APP_TOKEN"),
    tableId: requireEnv(env),
  };
}

/** 拉某张表全部记录（自动翻页） */
export async function searchRecords(table) {
  const { appToken, tableId } = tableRef(table);
  const items = [];
  let pageToken;
  do {
    const q = new URLSearchParams({ page_size: "200" });
    if (pageToken) q.set("page_token", pageToken);
    const data = await feishu(
      "POST",
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search?${q}`,
      {},
      `search.${table}`
    );
    items.push(...(data.items || []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);
  return items;
}

/** 批量新建记录（records: [{fields:{...}}]） */
export async function createRecords(table, records) {
  if (!records.length) return { records: [] };
  const { appToken, tableId } = tableRef(table);
  return feishu(
    "POST",
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
    { records },
    `create.${table}`
  );
}

/** 写某张表单条记录的字段 */
export async function updateRecord(table, recordId, fields) {
  const { appToken, tableId } = tableRef(table);
  return feishu(
    "PUT",
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    { fields },
    `update.${table}`
  );
}

/** 删除某张表单条记录（飞书回收站可恢复） */
export async function deleteRecord(table, recordId) {
  const { appToken, tableId } = tableRef(table);
  return feishu(
    "DELETE",
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    undefined,
    `delete.${table}`
  );
}

// —— 选题表专用别名（兼容既有评分/去重脚本）——
export const searchTopicRecords = () => searchRecords("topic");
export const updateTopicRecord = (recordId, fields) => updateRecord("topic", recordId, fields);
export const deleteTopicRecord = (recordId) => deleteRecord("topic", recordId);

/** 把飞书富文本/数组/对象字段取成纯文本（复刻 lib/feishu.ts fieldToText） */
export function fieldToText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((it) => {
        if (typeof it === "string") return it;
        if (it && typeof it === "object") {
          return fieldToText(it.text ?? it.name ?? it.title ?? it.link ?? "");
        }
        return fieldToText(it);
      })
      .filter(Boolean)
      .join("、");
  }
  if (typeof value === "object") {
    return fieldToText(value.text ?? value.name ?? value.title ?? value.value ?? "");
  }
  return "";
}
