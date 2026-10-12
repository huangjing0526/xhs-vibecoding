/**
 * grok 出片额度用完的记录，和 lib/engines/gemini/quota.ts 一个思路。
 *
 * grok 没有查额度的接口，登录态好好的也可能早就没有 credits。只能在出片真撞上
 * spending-limit 时记一笔，引擎卡片读它说「额度用完了」，不再显示「已登录，可用」。
 * 之后哪一镜出片成功，说明已经充过值，记录随之清掉。
 */

import { rm } from "node:fs/promises";
import path from "node:path";
import { readJsonFile, writeJsonFile } from "@/app/api/_localJson";

const STATE_FILE = path.join(process.cwd(), ".local", "engines", "grok-quota.json");

/** grok 的 403 长这样：{"code":"personal-team-blocked:spending-limit","error":"You have run out of credits ..."} */
const QUOTA_PATTERN = /spending-limit|run out of credits|need a grok subscription/i;

export const GROK_QUOTA_MESSAGE = "Grok 额度用完了：到 grok.com 充值后再出片，或换手动上传";

interface GrokQuotaRecord {
  at: string;
}

/** grok 的输出或报错里是额度用完：记一笔，换成看得懂的话抛出去；不是就什么都不做 */
export async function throwIfGrokQuota(output: string): Promise<void> {
  if (!QUOTA_PATTERN.test(output)) return;
  await writeJsonFile(STATE_FILE, { at: new Date().toISOString() } satisfies GrokQuotaRecord);
  throw new Error(GROK_QUOTA_MESSAGE);
}

export async function clearGrokQuota(): Promise<void> {
  await rm(STATE_FILE, { force: true });
}

export async function readGrokQuota(): Promise<GrokQuotaRecord | null> {
  return readJsonFile<GrokQuotaRecord | null>(STATE_FILE, null);
}
