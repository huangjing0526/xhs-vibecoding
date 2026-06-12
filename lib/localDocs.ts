import { createHash } from "crypto";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import type { GlossaryItem, MaterialItem } from "@/lib/xhsWorkflow";

export type LocalDocCategory = "daily" | "issues" | "glossary" | "standards";

export interface LocalDocsScanOptions {
  sourceDir?: string;
  categories?: LocalDocCategory[];
}

export interface LocalDocFileSummary {
  path: string;
  category: LocalDocCategory;
  extractedMaterials: number;
  extractedGlossary: number;
}

export interface LocalDocsScanResult {
  sourceDir: string;
  categories: LocalDocCategory[];
  scannedFiles: number;
  files: LocalDocFileSummary[];
  materials: MaterialItem[];
  glossary: GlossaryItem[];
}

interface MarkdownFile {
  fullPath: string;
  relativePath: string;
  category: LocalDocCategory;
}

interface ExtractedDocItems {
  materials: MaterialItem[];
  glossary: GlossaryItem[];
}

export const DEFAULT_LOCAL_DOCS_SOURCE_DIR = process.env.LOCAL_DOCS_SOURCE_DIR || "";

const DEFAULT_CATEGORIES: LocalDocCategory[] = ["daily", "issues", "glossary", "standards"];

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function hashText(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 12);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDateFromPath(relativePath: string): string {
  return relativePath.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
}

function extractTitle(content: string, fallback: string): string {
  return stripMarkdown(content.match(/^#\s+(.+)$/m)?.[1] || fallback);
}

function splitSections(content: string, headingPattern: RegExp): Array<{ heading: string; body: string }> {
  const matches = Array.from(content.matchAll(headingPattern));
  return matches.map((match, index) => {
    const start = match.index || 0;
    const nextStart = matches[index + 1]?.index ?? content.length;
    return {
      heading: stripMarkdown(match[1] || match[0]),
      body: content.slice(start, nextStart),
    };
  });
}

function firstMeaningfulParagraph(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(stripMarkdown)
    .filter((item) => item && !item.startsWith("|") && !item.includes("---"));
  return paragraphs[0] || "";
}

function firstBullets(text: string): string {
  const bullets = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map(stripMarkdown)
    .filter(Boolean);
  return bullets.slice(0, 3).join("\n");
}

function extractLabeledLine(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`[-*]\\s+\\*\\*${escaped}\\*\\*[:：]\\s*([^\\n]+)`));
  return stripMarkdown(match?.[1] || "");
}

function makeMaterial(params: {
  sourceId: string;
  sourceType: string;
  date: string;
  summary: string;
  event: string;
  pitfall?: string;
  method?: string;
  relatedTerm?: string;
}): MaterialItem {
  return {
    recordId: "",
    sourceId: params.sourceId,
    sourceType: params.sourceType,
    date: params.date,
    summary: params.summary,
    event: params.event,
    pitfall: params.pitfall || "",
    method: params.method || "",
    relatedTerm: params.relatedTerm || "",
    status: "待提炼",
  };
}

function makeGlossary(params: {
  term: string;
  explanation: string;
  misconception?: string;
  caseText?: string;
  reusableAsset?: string;
  titleAngle?: string;
}): GlossaryItem {
  return {
    recordId: "",
    term: params.term,
    explanation: params.explanation,
    misconception: params.misconception || "",
    caseText: params.caseText || "",
    reusableAsset: params.reusableAsset || "",
    titleAngle: params.titleAngle || `把「${params.term}」放进真实项目复盘里讲清楚`,
  };
}

function classifyMarkdownFile(relativePath: string): LocalDocCategory | null {
  const normalized = toPosixPath(relativePath);
  const filename = path.basename(normalized);

  if (normalized.startsWith("reports/daily/") && /^日报_|^周报_/.test(filename)) return "daily";
  if (normalized.startsWith("reports/issues/") && filename.startsWith("问题记录_")) return "issues";
  if (
    normalized === "学习资料/术语表.md" ||
    normalized === "学习资料/agent-design-handbook.md" ||
    normalized === "process/Vibe-Glossary.md" ||
    normalized === "process/Vibe-Coding-Cheat-Sheet.md"
  ) {
    return "glossary";
  }
  if (normalized.startsWith("AI协作约定/") || normalized.startsWith("process/")) return "standards";

  return null;
}

async function collectMarkdownFiles(sourceDir: string): Promise<MarkdownFile[]> {
  let stats;
  try {
    stats = await stat(sourceDir);
  } catch (error) {
    console.error("[LocalDocs] 读取文档目录失败", {
      userId: "local",
      tenantId: "local-docs",
      action: "localDocs.statSourceDir",
      sourceDir,
      error,
    });
    throw new Error("本地文档目录不存在或无法访问");
  }

  if (!stats.isDirectory()) {
    throw new Error("本地文档目录不存在或不是文件夹");
  }

  const files: MarkdownFile[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

      const relativePath = toPosixPath(path.relative(sourceDir, fullPath));
      const category = classifyMarkdownFile(relativePath);
      if (category) {
        files.push({ fullPath, relativePath, category });
      }
    }
  }

  await walk(sourceDir);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));
}

function extractDailyMaterials(relativePath: string, content: string): MaterialItem[] {
  const date = extractDateFromPath(relativePath);
  const sections = splitSections(content, /^###\s+(?:\d+\.\s*)?(.+)$/gm)
    .filter((section) => !/常规交付|试错记录|今日汇总|风险与依赖|明日计划|业务规则变更/.test(section.heading));

  if (sections.length === 0) {
    const title = extractTitle(content, relativePath);
    return [
      makeMaterial({
        sourceId: `DAILY-${date || hashText(relativePath)}`,
        sourceType: relativePath.includes("周报_") ? "开发周报" : "开发日报",
        date,
        event: title,
        summary: firstMeaningfulParagraph(content),
        method: firstBullets(content),
        relatedTerm: "AI Coding 工作流",
      }),
    ];
  }

  return sections.map((section, index) =>
    makeMaterial({
      sourceId: `DAILY-${date || hashText(relativePath)}-${String(index + 1).padStart(2, "0")}`,
      sourceType: relativePath.includes("周报_") ? "开发周报" : "开发日报",
      date,
      event: section.heading,
      summary: firstMeaningfulParagraph(section.body),
      method: firstBullets(section.body),
      relatedTerm: "AI Coding 工作流",
    })
  );
}

function extractIssueMaterials(relativePath: string, content: string): MaterialItem[] {
  const date = extractDateFromPath(relativePath);
  const sections = splitSections(content, /^###\s+(.+)$/gm);

  return sections
    .filter((section) => /｜/.test(section.heading))
    .map((section) => {
      const parts = section.heading.split("｜").map((item) => stripMarkdown(item));
      const issueCode = parts[0]?.replace(/[^\w-]/g, "") || hashText(section.heading);
      return makeMaterial({
        sourceId: `ISSUE-${date || hashText(relativePath)}-${issueCode}`,
        sourceType: "问题记录",
        date,
        event: parts[1] || section.heading,
        summary: extractLabeledLine(section.body, "现象") || firstMeaningfulParagraph(section.body),
        pitfall: extractLabeledLine(section.body, "原因"),
        method: extractLabeledLine(section.body, "解决方案") || firstBullets(section.body),
        relatedTerm: "避坑复盘",
      });
    });
}

function extractTableGlossary(relativePath: string, content: string): GlossaryItem[] {
  const tableGroups: string[][] = [];
  let currentGroup: string[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      currentGroup.push(line);
      continue;
    }

    if (currentGroup.length > 0) {
      tableGroups.push(currentGroup);
      currentGroup = [];
    }
  }

  if (currentGroup.length > 0) {
    tableGroups.push(currentGroup);
  }

  return tableGroups.flatMap((group) => {
    const rows = group.filter((line) => !/^\|\s*:?-+/.test(line));
    return rows.slice(1).flatMap((line) => {
      const safeLine = line.replace(/\\\|/g, "__PIPE__");
      const cells = safeLine
        .split("|")
        .slice(1, -1)
        .map((cell) => stripMarkdown(cell.replace(/__PIPE__/g, "|")));
      const term = cells[0];
      const explanation = cells[1];
      if (!term || !explanation) return [];
      return makeGlossary({
        term,
        explanation,
        caseText: `来源：${relativePath}`,
        reusableAsset: explanation,
      });
    });
  });
}

function extractHeadingGlossary(relativePath: string, content: string): GlossaryItem[] {
  const sections = splitSections(content, /^###\s+(.+)$/gm);
  const effectiveSections = relativePath.endsWith("agent-design-handbook.md")
    ? sections.filter((section) => /^Q\d+[：:]/.test(section.heading))
    : sections;
  return effectiveSections.flatMap((section) => {
    const term = section.heading.replace(/^Q\d+[：:]\s*/, "");
    const explanation =
      extractLabeledLine(section.body, "是什么") ||
      section.body.match(/\*\*通俗版\*\*[:：]\s*([^\n]+)/)?.[1] ||
      firstMeaningfulParagraph(section.body);
    if (!term || !explanation) return [];

    return makeGlossary({
      term,
      explanation: stripMarkdown(explanation),
      misconception: extractLabeledLine(section.body, "为什么要"),
      caseText: `来源：${relativePath}`,
      reusableAsset: firstBullets(section.body),
    });
  });
}

function extractStandardMaterials(relativePath: string, content: string): MaterialItem[] {
  const title = extractTitle(content, relativePath);
  const date = extractDateFromPath(relativePath);
  return [
    makeMaterial({
      sourceId: `STD-${hashText(relativePath)}`,
      sourceType: relativePath.startsWith("AI协作约定/") ? "AI协作标准" : "协作流程",
      date,
      event: title,
      summary: firstMeaningfulParagraph(content),
      method: firstBullets(content),
      relatedTerm: "Agent 协作",
    }),
  ];
}

function extractItems(file: MarkdownFile, content: string): ExtractedDocItems {
  if (file.category === "daily") {
    return { materials: extractDailyMaterials(file.relativePath, content), glossary: [] };
  }

  if (file.category === "issues") {
    return { materials: extractIssueMaterials(file.relativePath, content), glossary: [] };
  }

  if (file.category === "glossary") {
    const tableGlossary = file.relativePath.endsWith("agent-design-handbook.md")
      ? []
      : extractTableGlossary(file.relativePath, content);
    return {
      materials: [],
      glossary: [
        ...tableGlossary,
        ...extractHeadingGlossary(file.relativePath, content),
      ],
    };
  }

  return { materials: extractStandardMaterials(file.relativePath, content), glossary: [] };
}

export async function scanLocalDocs(options: LocalDocsScanOptions = {}): Promise<LocalDocsScanResult> {
  const sourceDir = options.sourceDir?.trim() || DEFAULT_LOCAL_DOCS_SOURCE_DIR;
  if (!sourceDir) {
    throw new Error("请先填写本地文档目录");
  }

  const categories = options.categories?.length ? options.categories : DEFAULT_CATEGORIES;
  const categorySet = new Set(categories);
  const files = (await collectMarkdownFiles(sourceDir)).filter((file) => categorySet.has(file.category));
  const materials: MaterialItem[] = [];
  const glossary: GlossaryItem[] = [];
  const summaries: LocalDocFileSummary[] = [];

  for (const file of files) {
    const content = await readFile(file.fullPath, "utf-8");
    const extracted = extractItems(file, content);
    materials.push(...extracted.materials);
    glossary.push(...extracted.glossary);
    summaries.push({
      path: file.relativePath,
      category: file.category,
      extractedMaterials: extracted.materials.length,
      extractedGlossary: extracted.glossary.length,
    });
  }

  return {
    sourceDir,
    categories,
    scannedFiles: files.length,
    files: summaries,
    materials,
    glossary,
  };
}
