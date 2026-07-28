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

  const data = await parseFeishuResponse<{ tenant_access_token?: string; expire?: number }>(response, action);
  if (!data.tenant_access_token) {
    throw new Error("飞书未返回 tenant_access_token");
  }

  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: now + Math.max((data.expire || 7200) - 300, 60) * 1000,
  };

  return tokenCache.token;
}

async function parseFeishuResponse<T>(response: Response, action: string): Promise<T> {
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
    throw new Error("飞书接口响应格式异常");
  }

  if (!response.ok || payload.code !== 0) {
    console.error("[Feishu] 接口调用失败", {
      userId: "local",
      tenantId: "feishu",
      action,
      status: response.status,
      code: payload.code,
      msg: payload.msg,
    });
    throw new Error(payload.msg ? `飞书接口失败：${payload.msg}` : "飞书接口调用失败");
  }

  return payload.data ?? payload;
}

export async function feishuRequest<T>(
  method: HttpMethod,
  path: string,
  body: unknown | undefined,
  action: string
): Promise<T> {
  const token = await getTenantAccessToken();
  const response = await fetch(`${getFeishuApiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return parseFeishuResponse<T>(response, action);
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
