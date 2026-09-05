#!/usr/bin/env node
/**
 * 把 video-generator 那边已经跑好的模特资产导进图片工厂的模特库。
 *
 *   node scripts/image-factory/import-model-library.mjs --dry-run     # 先看映射对不对
 *   node scripts/image-factory/import-model-library.mjs
 *   node scripts/image-factory/import-model-library.mjs --from /别的/库
 *
 * 那边一个模特一个目录，文件名自带视角（head-left-45 / body-front / expression-wink），
 * identity-profile.md 里第一段就是这位模特的体貌描述——正好是模特库要的 traits。
 * 一个版本 = 一套造型（v1 棚拍针织、v2.3 户外白 T），所以按版本各存一条档案：
 * 「每个视角取最高版」会把两套造型混进同一位模特，锁脸参考就自相矛盾了。
 * 只有一个版本时不加后缀，档案名就是模特名。
 * 带额外后缀的（-v2.3-mardi09）是换装试片不是身份资产，跳过。
 *
 * 重复导入安全：同名模特 + 同视角已经在库里就跳过，不会攒出一堆一样的图。
 *
 * 存进来的图统一转成 JPEG：尺寸不动，肉眼无损，但一位模特的整套资产从 30MB 降到 5MB 上下。
 * 库里的图既要喂 CLI 又要在选择器里排成缩略图，扛着一堆 1.4MB 的 PNG 两头都不划算。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

const ROOT = process.cwd();
const DEFAULT_SOURCE = "/Users/kp/video-generator/library/models";
const TARGET = path.join(ROOT, ".local", "image-factory", "models");
const INDEX = path.join(TARGET, "index.json");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
// 身份和造型各自留额度：身份段动辄七八百字，全给它就把「这一版穿什么」挤没了
const IDENTITY_MAX = 600;
const STYLING_MAX = 400;
const JPEG_QUALITY = 92;
// 单张两张的版本是中途试片，不是一套造型，别在库里攒出一堆只有一张图的档案
const MIN_VERSION_ASSETS = 3;

/** 文件名里的视角 key → 库里显示的视角名。没列到的一律不导：那是场景试片，不是身份资产。 */
const VIEW_LABELS = {
  "head-front": "正面头肩",
  "head-front-close": "定妆近景",
  "head-left-22": "左转 22°",
  "head-left-45": "左转 45°",
  "head-left-67": "左转 67°",
  "head-left-profile": "左正侧脸",
  "head-right-22": "右转 22°",
  "head-right-45": "右转 45°",
  "head-right-67": "右转 67°",
  "head-right-profile": "右正侧脸",
  "head-up-15": "微抬头",
  "head-down-15": "微低头",
  "expression-soft-smile": "柔和微笑",
  "expression-eyes-closed": "闭眼",
  "expression-mouth-open": "张嘴",
  "expression-lips-rounded": "圆唇",
  "expression-cool": "酷脸",
  "expression-laugh": "大笑",
  "expression-shout": "呼喊",
  "expression-wink": "眨眼",
  "half-body-front": "半身定妆",
  "half-body-anchor": "半身定妆",
  "body-front": "正面全身",
  "body-side": "侧面全身",
  "body-back": "背面全身",
  "body-left-45": "左转全身",
  "body-right-45": "右转全身",
};

// reference.png 是当初拿来起模的外部参考（常是别家电商图，带 logo 和真人），
// 它不是这位虚拟模特的资产，也不该被当参考图喂回生成，一律不导。

/** PNG 转 JPEG，尺寸原样保留；已经是 JPEG 的直接复制。 */
function storeImage(sourcePath, targetPath) {
  if (path.extname(targetPath) !== ".jpg") {
    copyFileSync(sourcePath, targetPath);
    return;
  }
  const script = `
from PIL import Image
Image.open(${JSON.stringify(sourcePath)}).convert("RGB").save(
    ${JSON.stringify(targetPath)}, "JPEG", quality=${JPEG_QUALITY}, optimize=True, progressive=True
)
`;
  execFileSync("python3", ["-c", script], { stdio: ["ignore", "ignore", "pipe"] });
}

function parseArgs(argv) {
  const from = (argv.find((arg) => arg.startsWith("--from=")) || "").split("=")[1];
  const fromIndex = argv.indexOf("--from");
  return {
    source: from || (fromIndex >= 0 ? argv[fromIndex + 1] : "") || DEFAULT_SOURCE,
    dryRun: argv.includes("--dry-run"),
  };
}

/** 版本号按段比大小，避免 "v2.3" < "v2.10" 这种字符串序的坑。 */
function compareVersions(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * 文件名拆成 { key, version }。
 * 见过的三种形态：`<模特名>-head-left-45-v1.png`、`body-front.png`、`<模特名>-body-front-v2.3-mardi09.png`。
 */
function parseAssetName(fileName, modelName) {
  const base = path.basename(fileName, path.extname(fileName));
  const withoutModel = base.startsWith(`${modelName}-`) ? base.slice(modelName.length + 1) : base;
  const versioned = withoutModel.match(/^(.+?)-v([\d.]+)(?:-(.+))?$/);
  if (!versioned) return { key: withoutModel, version: "0" };
  // 版本号后面还挂着标签的是换装试片，不当身份资产
  if (versioned[3]) return null;
  return { key: versioned[1], version: versioned[2] };
}

function cleanProfileLine(line) {
  const text = line.replace(/^#+\s+/, "").replace(/^-\s+/, "").replace(/`/g, "").trim();
  // 内部标识和锚点文件名对生成没用，喂给模型只会添乱
  if (!text || text.startsWith("内部身份标识") || text.startsWith("主身份锚点")) return "";
  return text;
}

/**
 * identity-profile.md 的第一段是身份本身（脸、骨相、不变的特征），
 * 之后每个 `## vX …` 段落是那一版的造型锁定。
 * 一条档案的描述 = 身份 + 它自己那一版的造型，不然拿 v1 的针织衫去描述 v2.3 的白 T。
 */
function readTraits(modelDir, version) {
  const profilePath = path.join(modelDir, "identity-profile.md");
  if (!existsSync(profilePath)) return "";

  const lines = readFileSync(profilePath, "utf8").split("\n");
  const base = [];
  const versionLines = [];
  const versionHeading = version === "0" ? null : new RegExp(`^##\\s+v${version.replace(/\./g, "\\.")}(\\D|$)`);
  let section = "base";

  for (const line of lines) {
    if (line.startsWith("## ")) {
      section = versionHeading?.test(line) ? "version" : "other";
      continue;
    }
    const text = cleanProfileLine(line);
    if (!text) continue;
    if (section === "base") base.push(text);
    else if (section === "version") versionLines.push(text);
  }

  const clip = (lines, max) => {
    const text = lines.join(" ").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
  };
  return [clip(base, IDENTITY_MAX), clip(versionLines, STYLING_MAX)].filter(Boolean).join(" ");
}

/** 一个模特目录 → 按版本分成若干套造型，每套里同一视角只留一张。 */
function collectVersions(modelDir, modelName) {
  const byVersion = new Map();
  for (const fileName of readdirSync(modelDir).sort()) {
    const fullPath = path.join(modelDir, fileName);
    if (!statSync(fullPath).isFile()) continue;
    if (!IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase())) continue;

    const parsed = parseAssetName(fileName, modelName);
    if (!parsed || !VIEW_LABELS[parsed.key]) continue;

    const bucket = byVersion.get(parsed.version) || new Map();
    if (!bucket.has(parsed.key)) bucket.set(parsed.key, { ...parsed, fullPath, label: VIEW_LABELS[parsed.key] });
    byVersion.set(parsed.version, bucket);
  }

  const versions = [...byVersion.entries()]
    .sort((a, b) => compareVersions(a[0], b[0]))
    .map(([version, bucket]) => ({ version, assets: [...bucket.values()] }));

  const complete = versions.filter((item) => item.assets.length >= MIN_VERSION_ASSETS);
  // 全都不成套时至少留最大的那组，别把只有一张 head-front 的模特整个丢掉
  if (complete.length > 0) return complete;
  return versions.sort((a, b) => b.assets.length - a.assets.length).slice(0, 1);
}

function main() {
  const { source, dryRun } = parseArgs(process.argv.slice(2));
  if (!existsSync(source)) {
    console.error(`源目录不存在：${source}`);
    process.exit(1);
  }

  const index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : [];
  const known = new Set(index.map((record) => `${record.name}::${record.sourceLabel}`));
  const added = [];
  let skipped = 0;

  for (const modelName of readdirSync(source).sort()) {
    const modelDir = path.join(source, modelName);
    // _prompts / _staging 是工作目录，不是模特
    if (modelName.startsWith("_") || modelName.startsWith(".") || !statSync(modelDir).isDirectory()) continue;

    const versions = collectVersions(modelDir, modelName);
    if (versions.length === 0) continue;

    for (const { version, assets } of versions) {
      // 只有一套造型就不加版本后缀，免得库里全是「xx v1」这种噪音
      const profileName = versions.length > 1 && version !== "0" ? `${modelName} v${version}` : modelName;
      const traits = readTraits(modelDir, version);

      const fresh = assets.filter((asset) => !known.has(`${profileName}::${asset.label}`));
      skipped += assets.length - fresh.length;
      console.info(`[import] ${profileName}：${fresh.length} 张待导入${assets.length - fresh.length > 0 ? `（已在库里 ${assets.length - fresh.length} 张）` : ""}${traits ? "" : "，没有 identity-profile.md，体貌描述留空"}`);

      for (const asset of fresh) {
      const record = {
        id: `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
        name: profileName,
        sourceLabel: asset.label,
        createdAt: new Date().toISOString(),
        // 统一落成 .jpg：webp 也转，省得取图端点为个别格式再分支
        extension: ".jpg",
        traits,
      };
      if (!dryRun) {
        mkdirSync(TARGET, { recursive: true });
        storeImage(asset.fullPath, path.join(TARGET, `${record.id}${record.extension}`));
      }
        added.push(record);
      }
    }
  }

  if (dryRun) {
    console.info(`[import] --dry-run：会导入 ${added.length} 张，跳过 ${skipped} 张已在库里的，不写盘`);
    return;
  }

  // 新的排前面，跟模特库自己的写入顺序保持一致
  writeFileSync(INDEX, JSON.stringify([...added, ...index], null, 2), "utf8");
  console.info(`[import] 导入 ${added.length} 张，跳过 ${skipped} 张已在库里的，落在 ${TARGET}`);
}

main();
