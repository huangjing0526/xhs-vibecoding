import { createHash } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import type { ContentCard } from "@/lib/xhsWorkflow";

/**
 * 选题池对接：把个人内容库 `选题池.md` 里「待发酵 / 可启动」分区的提炼选题，
 * 解析成 studio 的 ContentCard 种子，供导入飞书选题表。
 * 只读不写；不触碰已发布 / 已废弃 / 非技术创始人试水区。
 */

/** 默认内容库目录，可用环境变量覆盖。 */
export const DEFAULT_TOPIC_POOL_DIR = process.env.XHS_TOPIC_POOL_DIR || "";

/** 选题池文件名（相对内容库目录）。 */
const TOPIC_POOL_FILE = "选题池.md";

/** 仅导入这两个主池分区（标题包含即命中）。 */
const INCLUDED_SECTION_KEYWORDS = ["待发酵", "可启动"];

/** 显式排除的分区，避免标题歧义误命中。 */
const EXCLUDED_SECTION_KEYWORDS = ["非技术创始人", "已发布", "已废弃"];

export interface TopicPoolScanOptions {
  /** 内容库目录；缺省用 DEFAULT_TOPIC_POOL_DIR。 */
  sourceDir?: string;
}

export interface TopicPoolScanResult {
  /** 实际读取的文件绝对路径。 */
  filePath: string;
  /** 命中的分区标题。 */
  sections: string[];
  /** 解析出的选题种子。 */
  topics: ContentCard[];
}

function stableTopicId(title: string): string {
  const hash = createHash("sha1").update(title.trim()).digest("hex").slice(0, 8);
  return `TOPIC-POOL-${hash}`;
}

/** 把一行 markdown 表格按 `|` 切成单元格。 */
function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|");
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

/** 表头列名 → 标准字段。形式列名常带括号说明，用 startsWith 容错。 */
function classifyColumn(header: string): "title" | "form" | "source" | "notes" | "ignore" {
  const name = header.replace(/\s/g, "");
  if (name.startsWith("选题")) return "title";
  if (name.startsWith("形式")) return "form";
  if (name.startsWith("灵感来源") || name.startsWith("真实出处")) return "source";
  if (name.startsWith("备注") || name.startsWith("切入角度")) return "notes";
  return "ignore";
}

/** 从备注里抽「技能=…」作为可复用资产 / 核心观点。 */
function extractSkill(notes: string): string {
  const match = notes.match(/技能\s*=\s*([^;；]+)/);
  return match ? match[1].trim() : "";
}

/** 从备注里抽命中的「道N」标签。 */
function extractDaokuHit(notes: string): string {
  const hits = notes.match(/道[0-9]/g);
  return hits ? Array.from(new Set(hits)).join("、") : "";
}

/** 从备注里抽「偏爆 / 偏哑」判定。 */
function extractDaokuVerdict(notes: string): string {
  const match = notes.match(/偏(爆|哑)/);
  return match ? match[0] : "";
}

function buildSeed(params: {
  title: string;
  form: string;
  source: string;
  notes: string;
}): ContentCard {
  const skill = extractSkill(params.notes);
  const daokuHit = extractDaokuHit(params.notes);
  const daokuVerdict = extractDaokuVerdict(params.notes);

  return {
    topicId: stableTopicId(params.title),
    sourceMaterial: params.source,
    relatedTerm: "",
    column: params.form,
    targetReader: "",
    painPoint: "",
    coreViewpoint: skill || params.title,
    realCase: "",
    reusableAsset: skill,
    titleCandidates: [params.title],
    coverText: "",
    outline: [],
    commentPrompt: "",
    estimatedSaveValue: 3,
    status: "待写",
    ...(daokuHit ? { daokuHit } : {}),
    ...(daokuVerdict ? { daokuVerdict } : {}),
  };
}

/** 解析单个分区正文里的表格 → 选题种子。 */
function parseSectionTopics(body: string): ContentCard[] {
  const lines = body.split("\n");
  const seeds: ContentCard[] = [];

  let columnMap: Array<ReturnType<typeof classifyColumn>> | null = null;

  for (const line of lines) {
    if (!isTableRow(line)) continue;
    if (isSeparatorRow(line)) continue;

    const cells = parseTableRow(line);

    // 第一行表格内容当表头。
    if (!columnMap) {
      columnMap = cells.map(classifyColumn);
      continue;
    }

    const row: Record<string, string> = {};
    cells.forEach((cell, index) => {
      const key = columnMap?.[index];
      if (key && key !== "ignore") {
        row[key] = cell;
      }
    });

    const title = (row.title || "").trim();
    if (!title) continue;

    seeds.push(
      buildSeed({
        title,
        form: row.form || "",
        source: row.source || "",
        notes: row.notes || "",
      })
    );
  }

  return seeds;
}

function isIncludedSection(heading: string): boolean {
  if (EXCLUDED_SECTION_KEYWORDS.some((keyword) => heading.includes(keyword))) return false;
  return INCLUDED_SECTION_KEYWORDS.some((keyword) => heading.includes(keyword));
}

/** 扫描内容库的选题池，返回主池选题种子（按 topicId 去重）。 */
export async function scanTopicPool(options: TopicPoolScanOptions = {}): Promise<TopicPoolScanResult> {
  const sourceDir = options.sourceDir?.trim() || DEFAULT_TOPIC_POOL_DIR;
  if (!sourceDir) {
    throw new Error("未配置选题池目录，请填写内容库路径或设置 XHS_TOPIC_POOL_DIR");
  }

  const filePath = path.join(sourceDir, TOPIC_POOL_FILE);
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    throw new Error(`未找到选题池文件：${filePath}`);
  }

  // 以二级标题切分分区。
  const headingPattern = /^##\s+(.+)$/gm;
  const matches = Array.from(content.matchAll(headingPattern));

  const sections: string[] = [];
  const seeds: ContentCard[] = [];
  const seenTopicIds = new Set<string>();

  matches.forEach((match, index) => {
    const heading = match[1].trim();
    if (!isIncludedSection(heading)) return;

    const start = match.index ?? 0;
    const nextStart = matches[index + 1]?.index ?? content.length;
    const body = content.slice(start, nextStart);

    sections.push(heading);
    for (const seed of parseSectionTopics(body)) {
      if (seenTopicIds.has(seed.topicId)) continue;
      seenTopicIds.add(seed.topicId);
      seeds.push(seed);
    }
  });

  return { filePath, sections, topics: seeds };
}
