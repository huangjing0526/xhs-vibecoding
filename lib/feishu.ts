type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type WorkflowTableName = "material" | "glossary" | "topic" | "draft" | "review";

export interface FeishuRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

export interface FeishuSearchOptions {
  filter?: string;
  sort?: unknown[];
  view_id?: string;
  field_names?: string[];
  pageSize?: number;
}

interface TenantAccessTokenCache {
  token: string;
  expiresAt: number;
}

const DEFAULT_FEISHU_API_BASE = "https://open.feishu.cn";
const DEFAULT_PAGE_SIZE = 100;

let tokenCache: TenantAccessTokenCache | null = null;

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`缺少飞书配置：${name}`);
  }
  return value;
}

export function getMissingFeishuConfig(tableNames: WorkflowTableName[] = []): string[] {
  const envNames = ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_BASE_APP_TOKEN"];
  const tableEnvMap: Record<WorkflowTableName, string> = {
    material: "FEISHU_MATERIAL_TABLE_ID",
    glossary: "FEISHU_GLOSSARY_TABLE_ID",
    topic: "FEISHU_TOPIC_TABLE_ID",
    draft: "FEISHU_DRAFT_TABLE_ID",
    review: "FEISHU_REVIEW_TABLE_ID",
  };

  tableNames.forEach((tableName) => envNames.push(tableEnvMap[tableName]));
  return Array.from(new Set(envNames)).filter((name) => !getEnv(name));
}

export function hasFeishuConfig(tableNames: WorkflowTableName[] = []): boolean {
  return getMissingFeishuConfig(tableNames).length === 0;
}

export function getFeishuApiBase(): string {
  return getEnv("FEISHU_API_BASE") || DEFAULT_FEISHU_API_BASE;
}

export function getFeishuTableId(tableName: WorkflowTableName): string {
  const envMap: Record<WorkflowTableName, string> = {
    material: "FEISHU_MATERIAL_TABLE_ID",
    glossary: "FEISHU_GLOSSARY_TABLE_ID",
    topic: "FEISHU_TOPIC_TABLE_ID",
    draft: "FEISHU_DRAFT_TABLE_ID",
    review: "FEISHU_REVIEW_TABLE_ID",
  };
  return requireEnv(envMap[tableName]);
}

export function getFeishuAppToken(): string {
  return requireEnv("FEISHU_BASE_APP_TOKEN");
}

export function assertFeishuConfig(tableNames: WorkflowTableName[] = []): void {
  requireEnv("FEISHU_APP_ID");
  requireEnv("FEISHU_APP_SECRET");
  requireEnv("FEISHU_BASE_APP_TOKEN");
  tableNames.forEach(getFeishuTableId);
}

async function getTenantAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - now > 5 * 60 * 1000) {
    return tokenCache.token;
  }

  const action = "feishu.getTenantAccessToken";
  const response = await fetch(`${getFeishuApiBase()}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      app_id: requireEnv("FEISHU_APP_ID"),
      app_secret: requireEnv("FEISHU_APP_SECRET"),
    }),
  });

  const parsed = await parseFeishuResponse<{ tenant_access_token?: string; expire?: number }>(response, action);
  if (!parsed.ok) {
    console.error("[Feishu] 取 tenant_access_token 失败", {
      userId: "local",
      tenantId: "feishu",
      action,
      status: parsed.status,
      code: parsed.code,
      msg: parsed.msg,
    });
    throw new Error(parsed.msg);
  }

  const data = parsed.data;
  if (!data.tenant_access_token) {
    throw new Error("飞书未返回 tenant_access_token");
  }

  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: now + Math.max((data.expire || 7200) - 300, 60) * 1000,
  };

  return tokenCache.token;
}

const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTokenExpired(code: number | undefined, status: number): boolean {
  return status === 401 || code === 99991663 || code === 99991664 || code === 99991668;
}

function isRateLimitedOrTransient(code: number | undefined, status: number): boolean {
  return status === 429 || status >= 500 || code === 99991400 || code === 99991401;
}

async function parseFeishuResponse<T>(
  response: Response,
  action: string
): Promise<{ ok: true; data: T } | { ok: false; code?: number; status: number; msg: string; rawError?: unknown }> {
  const text = await response.text();
  let payload: any;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    console.error("[Feishu] 响应解析失败", {
      userId: "local",
      tenantId: "feishu",
      action,
      status: response.status,
      bodyPreview: text.slice(0, 300),
      error,
    });
    return { ok: false, status: response.status, msg: "飞书接口响应格式异常", rawError: error };
  }

  if (!response.ok || payload.code !== 0) {
    return {
      ok: false,
      status: response.status,
      code: payload.code,
      msg: payload.msg ? `飞书接口失败：${payload.msg}` : "飞书接口调用失败",
    };
  }

  return { ok: true, data: (payload.data ?? payload) as T };
}

export async function feishuRequest<T>(
  method: HttpMethod,
  path: string,
  body: unknown | undefined,
  action: string
): Promise<T> {
  let lastErrorMsg = "飞书接口调用失败";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const token = await getTenantAccessToken();
      const response = await fetch(`${getFeishuApiBase()}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      const parsed = await parseFeishuResponse<T>(response, action);
      if (parsed.ok) {
        return parsed.data;
      }

      lastErrorMsg = parsed.msg;

      // 如果是 token 失效，清空缓存并在下次重试中重新获取
      if (isTokenExpired(parsed.code, parsed.status)) {
        console.warn("[Feishu] Token 已失效或过期，正在刷新并重试", { action, code: parsed.code, attempt });
        tokenCache = null;
        if (attempt < MAX_RETRIES) {
          continue;
        }
      }

      // 如果是频控或服务端临时错误，指数退避后重试
      if (attempt < MAX_RETRIES && isRateLimitedOrTransient(parsed.code, parsed.status)) {
        const delay = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
        console.warn(`[Feishu] 接口触发频控或服务端错误(${parsed.code ?? parsed.status})，${delay}ms 后重试`, {
          action,
          attempt: attempt + 1,
        });
        await sleep(delay);
        continue;
      }

      console.error("[Feishu] 接口调用失败", {
        userId: "local",
        tenantId: "feishu",
        action,
        status: parsed.status,
        code: parsed.code,
        msg: parsed.msg,
      });
      throw new Error(parsed.msg);
    } catch (error) {
      if (attempt < MAX_RETRIES && (error instanceof TypeError || (error as Error).message.includes("fetch"))) {
        const delay = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
        console.warn(`[Feishu] 网络抖动，${delay}ms 后重试`, { action, attempt: attempt + 1, error });
        await sleep(delay);
        continue;
      }
      throw error instanceof Error ? error : new Error(lastErrorMsg);
    }
  }

  throw new Error(lastErrorMsg);
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function searchFeishuRecords(
  tableName: WorkflowTableName,
  options: FeishuSearchOptions = {}
): Promise<FeishuRecord[]> {
  assertFeishuConfig([tableName]);

  const appToken = getFeishuAppToken();
  const tableId = getFeishuTableId(tableName);
  const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
  const items: FeishuRecord[] = [];
  let pageToken: string | undefined;

  do {
    const query = buildQuery({
      page_size: pageSize,
      page_token: pageToken,
    });
    const data = await feishuRequest<{ items?: FeishuRecord[]; has_more?: boolean; page_token?: string }>(
      "POST",
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search${query}`,
      {
        filter: options.filter,
        sort: options.sort,
        view_id: options.view_id,
        field_names: options.field_names,
      },
      `feishu.searchRecords.${tableName}`
    );

    items.push(...(data.items || []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);

  return items;
}

export async function getFeishuRecord(
  tableName: WorkflowTableName,
  recordId: string
): Promise<FeishuRecord> {
  assertFeishuConfig([tableName]);

  const appToken = getFeishuAppToken();
  const tableId = getFeishuTableId(tableName);
  const data = await feishuRequest<{ record?: FeishuRecord }>(
    "GET",
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    undefined,
    `feishu.getRecord.${tableName}`
  );

  if (!data.record) {
    throw new Error("飞书记录不存在");
  }
  return data.record;
}

export async function createFeishuRecords(
  tableName: WorkflowTableName,
  records: Array<{ fields: Record<string, unknown> }>
): Promise<unknown> {
  assertFeishuConfig([tableName]);
  if (records.length === 0) return { records: [] };

  const appToken = getFeishuAppToken();
  const tableId = getFeishuTableId(tableName);
  return feishuRequest(
    "POST",
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
    { records },
    `feishu.createRecords.${tableName}`
  );
}

export async function updateFeishuRecord(
  tableName: WorkflowTableName,
  recordId: string,
  fields: Record<string, unknown>
): Promise<unknown> {
  assertFeishuConfig([tableName]);

  const appToken = getFeishuAppToken();
  const tableId = getFeishuTableId(tableName);
  return feishuRequest(
    "PUT",
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    { fields },
    `feishu.updateRecord.${tableName}`
  );
}

export async function deleteFeishuRecord(
  tableName: WorkflowTableName,
  recordId: string
): Promise<unknown> {
  assertFeishuConfig([tableName]);

  const appToken = getFeishuAppToken();
  const tableId = getFeishuTableId(tableName);
  return feishuRequest(
    "DELETE",
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    undefined,
    `feishu.deleteRecord.${tableName}`
  );
}

export function fieldToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          return fieldToText(obj.text ?? obj.name ?? obj.title ?? obj.link ?? "");
        }
        return fieldToText(item);
      })
      .filter(Boolean)
      .join("、");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return fieldToText(obj.text ?? obj.name ?? obj.title ?? obj.value ?? "");
  }
  return "";
}

export function fieldToNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const text = fieldToText(value).replace(/,/g, "").trim();
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

/**
 * 字段没填时返回 undefined，而不是 fieldToNumber 的 0。
 * 用于「这项没有数据」和「这项是 0」必须区分的字段（如只有部分记录才有的曝光量）。
 */
export function fieldToOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return fieldToNumber(value);
}
