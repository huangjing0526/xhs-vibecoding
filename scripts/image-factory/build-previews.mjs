#!/usr/bin/env node
/**
 * 把模板样例图压成卡片预览图。
 *
 * 样例在 .local/image-factory/samples/<模板id>/（不进 git，各人本机跑出来的），
 * 预览图落 public/template-previews/<模板id>.jpg（进 git，所有人打开就能看到）。
 *
 *   node scripts/image-factory/build-previews.mjs           # 用每个模板目录里的第一张
 *   node scripts/image-factory/build-previews.mjs --pick flat-to-model=store-mannequin.png
 *
 * 卡片图区是 aspect-[4/5]，所以按 4:5 裁切；竖图只裁掉 6%，场景基本完整。
 * 纵向裁切点偏上 18%，人像模板能保住脸和上半身。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SAMPLES = path.join(ROOT, ".local", "image-factory", "samples");
const OUT = path.join(ROOT, "public", "template-previews");
const WIDTH = 600;
const HEIGHT = 750;
const TOP_BIAS = 0.18;
const QUALITY = 72;

/** --pick <模板id>=<文件名> 可以指定某个模板用哪张样例，不指定就用目录里的第一张 */
function parsePicks(argv) {
  const picks = {};
  argv.forEach((arg, index) => {
    if (arg !== "--pick") return;
    const value = argv[index + 1] || "";
    const [id, file] = value.split("=");
    if (!id || !file) throw new Error(`--pick 需要 <模板id>=<文件名> 形式，收到「${value}」`);
    picks[id] = file;
  });
  return picks;
}

function crop(source, target) {
  const script = `
from PIL import Image
im = Image.open(${JSON.stringify(source)}).convert("RGB")
w, h = im.size
target = ${WIDTH} / ${HEIGHT}
if w / h > target:
    nw = int(h * target)
    box = ((w - nw) // 2, 0, (w - nw) // 2 + nw, h)
else:
    nh = int(w / target)
    top = int((h - nh) * ${TOP_BIAS})
    box = (0, top, w, top + nh)
im.crop(box).resize((${WIDTH}, ${HEIGHT}), Image.LANCZOS).save(
    ${JSON.stringify(target)}, "JPEG", quality=${QUALITY}, optimize=True, progressive=True
)
`;
  execFileSync("python3", ["-c", script], { stdio: ["ignore", "ignore", "pipe"] });
}

function main() {
  if (!existsSync(SAMPLES)) {
    console.error(`没有样例目录 ${SAMPLES}——先在图片工厂里跑几张，产物会自动落到那里`);
    process.exit(1);
  }
  const picks = parsePicks(process.argv.slice(2));
  mkdirSync(OUT, { recursive: true });

  let count = 0;
  for (const id of readdirSync(SAMPLES).sort()) {
    const dir = path.join(SAMPLES, id);
    const files = readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".png")).sort();
    if (files.length === 0) continue;

    const picked = picks[id];
    if (picked && !files.includes(picked)) {
      throw new Error(`模板 ${id} 里没有样例 ${picked}，现有：${files.join(", ")}`);
    }
    const source = path.join(dir, picked || files[0]);
    const target = path.join(OUT, `${id}.jpg`);
    crop(source, target);
    console.info(`[preview] ${id} ← ${path.basename(source)}`);
    count += 1;
  }
  console.info(`[preview] 共 ${count} 张，落在 public/template-previews/`);
}

main();
