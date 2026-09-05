/**
 * 字幕排版：把一句口播摆进画面底部，最多两行。
 *
 * 纯计算，不碰文件也不碰画布——排版规则是这一步最容易出错的地方
 * （标点跑到行首、第二行只剩一个字），单独放才好一眼看出规则、也好改。
 *
 * 宽度用「字宽单位」估：中文与全角标点算 1，ASCII 算 0.5。
 * 不用真实字体度量是因为服务端没有画布，而中文字幕几乎全是等宽方块字，
 * 这个近似的误差远小于一个字，够用来决定在哪儿断行。
 */

/** 不能出现在行首：避头尾里的「头」。 */
const NO_LINE_START = "，。！？、；：）〕］｝」』”’…·—～%";
/** 不能出现在行尾：避头尾里的「尾」。 */
const NO_LINE_END = "（〔［｛「『“‘";
/** 在这些标点之后断行最自然，优先选。 */
const PREFERRED_BREAK = "，。！？、；：";

export interface SubtitleLayout {
  lines: string[];
  /** 实际用的字号；一行放不下会自动缩到放得下为止 */
  fontSize: number;
}

export interface SubtitleLayoutOptions {
  /** 画面宽度（px） */
  width: number;
  /** 左右各留白（px），字幕不贴边 */
  paddingX?: number;
  maxLines?: number;
  maxFontSize?: number;
  minFontSize?: number;
}

/** 一个字符占几个字宽。 */
function charUnits(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  // ASCII：字母数字半角标点都按半个字算
  if (code < 0x2000) return code === 32 ? 0.35 : 0.5;
  return 1;
}

/** 一段文字有多少个字宽。 */
export function measureUnits(text: string): number {
  let total = 0;
  for (const ch of text) total += charUnits(ch);
  return total;
}

/**
 * 句末的句号去掉。
 * 短视频字幕基本不带句末句号，留着还会因为「一个句号单独占一行」把排版顶乱。
 * 问号叹号是语气的一部分，保留。
 */
export function normalizeSubtitleText(text: string): string {
  return text.trim().replace(/[。．.]+$/, "");
}

/** 这个位置能不能断开。 */
function canBreakAt(text: string, cut: number): boolean {
  if (cut <= 0 || cut >= text.length) return false;
  // 断点之后是「不能当行首的标点」→ 断了它就跑到行首去了
  if (NO_LINE_START.includes(text[cut])) return false;
  // 断点之前是「不能当行尾的标点」→ 断了它就被孤零零留在行尾
  if (NO_LINE_END.includes(text[cut - 1])) return false;
  return true;
}

/**
 * 切成两行。
 * 优先切在标点之后（读起来是个停顿），其次才切在任意位置；
 * 同一优先级里挑两行最接近等长的那个切点——第二行只剩一两个字最难看。
 */
function splitTwoLines(text: string, maxUnits: number): string[] | null {
  let best: { rank: number; gap: number; lines: string[] } | null = null;
  for (let cut = 1; cut < text.length; cut += 1) {
    if (!canBreakAt(text, cut)) continue;
    const head = text.slice(0, cut);
    const tail = text.slice(cut);
    const headUnits = measureUnits(head);
    const tailUnits = measureUnits(tail);
    if (headUnits > maxUnits || tailUnits > maxUnits) continue;
    // 切点正好压在标点后面，读起来是自然的停顿，优先级最高
    const rank = PREFERRED_BREAK.includes(text[cut - 1]) ? 0 : 1;
    const gap = Math.abs(headUnits - tailUnits);
    if (!best || rank < best.rank || (rank === best.rank && gap < best.gap)) {
      best = { rank, gap, lines: [head, tail] };
    }
  }
  return best?.lines ?? null;
}

/**
 * 排一句字幕。
 *
 * 先按最大字号试；一行放得下就一行，放不下就切两行；
 * 两行还放不下就缩字号再来一遍，直到最小字号为止。
 * 缩到最小仍放不下时不再截断文字——宁可挤一点也不能把话吞掉。
 */
export function layoutSubtitle(text: string, options: SubtitleLayoutOptions): SubtitleLayout {
  const content = normalizeSubtitleText(text);
  const paddingX = options.paddingX ?? 48;
  const maxLines = options.maxLines ?? 2;
  const maxFontSize = options.maxFontSize ?? 44;
  const minFontSize = options.minFontSize ?? 32;
  const usable = Math.max(1, options.width - paddingX * 2);

  if (!content) return { lines: [], fontSize: maxFontSize };

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 2) {
    const maxUnits = usable / fontSize;
    if (measureUnits(content) <= maxUnits) return { lines: [content], fontSize };
    if (maxLines >= 2) {
      const two = splitTwoLines(content, maxUnits);
      if (two) return { lines: two, fontSize };
    }
  }

  // 缩到最小还是放不下：按最小字号硬切，保证一个字都不丢
  const fontSize = minFontSize;
  const maxUnits = usable / fontSize;
  const lines: string[] = [];
  let current = "";
  for (const ch of content) {
    if (measureUnits(current + ch) <= maxUnits || !current) current += ch;
    else {
      lines.push(current);
      current = ch;
    }
  }
  if (current) lines.push(current);
  return { lines, fontSize };
}
