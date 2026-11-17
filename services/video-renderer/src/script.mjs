/**
 * 口播脚本的切分：一份原始脚本 → 若干「一次生成一段」的片段 / 若干屏字幕。
 *
 * 数字人那条产线必须切段——百炼单次只吃 20 秒以内的音频。切在句子边界上，
 * 不按字数硬切：从中间断开会让配音在段与段之间出现不自然的停顿。
 */

/** 中文口播的经验语速（字/秒）。TTS 前只能按它估时长，真实时长以合成结果为准。 */
export const CHARS_PER_SEC = 4.5;

/** 按句末标点与换行切句，保留标点。 */
function splitSentences(text) {
  return String(text || "")
    .split(/\n+|(?<=[。！？!?；;])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function charCount(text) {
  return Array.from(text.replace(/\s+/g, "")).length;
}

/**
 * 把脚本切成每段不超过 maxSec 的片段。
 *
 * 单句本身就超长时只能硬切——句子内部没有可用的边界，切了总比整段被平台拒了强。
 */
export function splitScriptForAvatar(script, maxSec) {
  const maxChars = Math.floor(maxSec * CHARS_PER_SEC);
  const segments = [];
  let current = "";

  const push = () => {
    if (current.trim()) segments.push(current.trim());
    current = "";
  };

  for (const sentence of splitSentences(script)) {
    if (charCount(sentence) > maxChars) {
      push();
      const chars = Array.from(sentence);
      for (let i = 0; i < chars.length; i += maxChars) {
        segments.push(chars.slice(i, i + maxChars).join(""));
      }
      continue;
    }

    if (charCount(current) + charCount(sentence) > maxChars) push();
    current += sentence;
  }
  push();

  if (segments.length === 0) {
    throw new Error("脚本是空的，写点内容再生成");
  }
  return segments;
}

/**
 * 混合剪辑的切分：把脚本切成「开场出镜的那几句」和「剩下的」两段。
 *
 * 这是成本的主要杠杆：只有开场那几秒真的去跑对口型（按秒计费），后面用图片铺画面，
 * Prefer sentence boundaries; split a long first sentence to respect the selected budget.
 *
 * @returns {{ opening: string, rest: string }} rest 为空串表示整段都在开场里
 */
export function splitScriptForHybrid(script, openingSec) {
  const [opening, ...rest] = splitScriptForAvatar(script, Math.max(1, openingSec));
  return { opening, rest: rest.join("") };
}

/** 估算一段文字的配音时长（秒），用于生成前的费用预估。 */
export function estimateDurationSec(script) {
  return Math.max(1, Math.round(charCount(String(script || "")) / CHARS_PER_SEC));
}

/**
 * 把一段文字切成字幕，并按字数比例分掉这段配音的时长。
 *
 * 之前是把所有字幕平均分整条时长，字数不同的句子念的时间却一样长，字幕会越跑越偏
 * （实测开场 6 秒的一句话，字幕在 3.9 秒就翻页了）。按字数分不完美——语速会随标点起伏——
 * 但比平均分准得多，且不用引入逐字时间戳。
 *
 * @returns {Array<{ text: string, durationSec: number }>}
 */
export function distributeSubtitles(text, durationSec, maxChars = 18) {
  const lines = splitScriptToSubtitles(text, maxChars);
  const total = lines.reduce((sum, line) => sum + charCount(line), 0) || 1;

  return lines.map((line) => ({
    text: line,
    durationSec: (charCount(line) / total) * durationSec,
  }));
}

/** 句中标点。硬切时若切在它前面，会让下一行以标点开头，很难看。 */
const PUNCTUATION = /[，、：；。！？,:;!?）】」』]/;

/**
 * 切成逐屏字幕。竖屏一行放不下太多字，按标点切完再按 maxChars 折行。
 *
 * 折行点会往后让一格，把跟在后面的标点带上——否则会出现「…反过来 / ：先把…」这种行首标点。
 */
export function splitScriptToSubtitles(script, maxChars = 18) {
  const subtitles = [];

  for (const sentence of splitSentences(script)) {
    const clean = sentence.replace(/\s+/g, "");
    const chars = Array.from(clean);

    let start = 0;
    while (start < chars.length) {
      let end = Math.min(start + maxChars, chars.length);
      while (end < chars.length && PUNCTUATION.test(chars[end])) end += 1;
      subtitles.push(chars.slice(start, end).join(""));
      start = end;
    }
  }

  return subtitles.length ? subtitles : [String(script || "").slice(0, maxChars)];
}
