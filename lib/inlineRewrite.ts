import type { BloggerDistillation } from "./bloggerWorkflow";

/** 预设改写动作；custom 走用户自己写的指令。 */
export type InlineRewriteAction = "polish" | "expand" | "condense" | "hook" | "custom";

export interface InlineRewriteRequest {
  /** 用户选中的原文片段 */
  selection: string;
  action: InlineRewriteAction;
  /** action=custom 时的自由指令 */
  instruction?: string;
  /** 所在笔记的上下文，让改写不脱离整篇 */
  noteTitle?: string;
  painPoint?: string;
}

export interface InlineRewriteResult {
  /** 改写后的片段，直接替换选区 */
  text: string;
}

const ACTION_RULE: Record<Exclude<InlineRewriteAction, "custom">, string> = {
  polish: "润色这段话：保持长度和信息量基本不变，让表达更顺、更像人话，去掉翻译腔和空话。",
  expand: "扩写这段话：补充一层具体的场景或例子，把抽象结论落到读者能对号入座的处境上，长度可到原文的 1.5-2 倍。",
  condense: "精简这段话：砍掉铺垫和重复，只留最锋利的判断，长度压到原文的一半左右。",
  hook: "把这段话改写成一个开头钩子：先抛读者的真实处境或反差判断，让人想继续读下去，控制在两三句内。",
};

export const INLINE_REWRITE_LABEL: Record<InlineRewriteAction, string> = {
  polish: "润色",
  expand: "扩写",
  condense: "精简",
  hook: "换钩子",
  custom: "自定义",
};

/** 无 AI Key 时的兜底：不编造内容，只做能确定做对的机械处理。 */
export function createFallbackInlineRewrite(request: InlineRewriteRequest): InlineRewriteResult {
  const text = request.selection.trim();

  if (request.action === "condense") {
    // 按句截断而不是按字数硬切，避免把句子切成半截
    const sentences = text.split(/(?<=[。！？!?])/).filter((part) => part.trim());
    const keep = Math.max(1, Math.ceil(sentences.length / 2));
    return { text: sentences.slice(0, keep).join("").trim() || text };
  }

  // 其余动作靠模型才有意义，没 Key 时原样返回，由调用方提示「未配置 AI」
  return { text };
}

export function buildInlineRewritePrompt(request: InlineRewriteRequest, distillation: BloggerDistillation | null): string {
  const rule =
    request.action === "custom"
      ? `按用户指令改写这段话。用户指令：${request.instruction}`
      : ACTION_RULE[request.action];

  const context = [
    request.noteTitle ? `所在笔记标题：${request.noteTitle}` : "",
    request.painPoint ? `这篇笔记要戳的读者痛点：${request.painPoint}` : "",
    distillation?.coreDao ? `对标博主的核心道：${distillation.coreDao}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `你在帮人改写一篇中文社交媒体笔记里的一个片段。

${rule}

硬性要求：
- 只输出改写后的片段本身，不要解释、不要加引号、不要写「改写后：」这类前缀。
- 不许编造原文没有的数据、收益、时间和规模。
- 保持中文口语，不要翻译腔，不要 emoji 堆砌。
- 保持与上下文同一人称和语气。
${context ? `\n上下文：\n${context}\n` : ""}
原片段：
${request.selection}

用 JSON 返回，格式：{"text": "改写后的片段"}`;
}
