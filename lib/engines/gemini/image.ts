/**
 * Gemini 生图：generateContent 一次同步返回，图就在响应体里。
 *
 * 比 codex / grok 那条 CLI 通道简单一截——不用起进程、不用约定输出路径、
 * 不用跑完再去目录里捞产物，也就不需要 findOutputImage 那套兜底。
 */

import { stat, writeFile } from "node:fs/promises";
import { IMAGE_PROVIDER_CAPS, ratioIsEnforced } from "@/lib/imageFactory";
import { geminiRequest, readInlineImage } from "./index";
import { withQuotaTracking } from "./quota";

/** 引擎能力由能力表说了算，这里不再自留一份 —— 自留的那份没人知道，也没人会跟着改 */
const CAPS = IMAGE_PROVIDER_CAPS.gemini;

interface InlinePart {
  inlineData: { mimeType: string; data: string };
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

export interface GeminiImageRequest {
  model: string;
  prompt: string;
  /** 参考图的本机绝对路径，按传入顺序送给模型 */
  inputPaths: string[];
  aspectRatio?: string;
  outputPath: string;
  signal?: AbortSignal;
}

export interface GeminiImageResult {
  outputPath: string;
  mimeType: string;
  /** 模型除了图之外还说的话，通常是空的；出问题时它会在这里解释 */
  note: string;
}

/**
 * 生成一张图并落盘。
 *
 * 图放在文字前面，与 lib/workflowAi.ts 的做法一致：模型先看完素材再读要求，比反过来准。
 */
export async function generateGeminiImage(request: GeminiImageRequest): Promise<GeminiImageResult> {
  // 先按文件大小判一次：读完再判等于内存已经吃掉了，那道检查什么也没省下
  const sizes = await Promise.all(request.inputPaths.map((item) => stat(item)));
  const totalBytes = sizes.reduce((sum, info) => sum + info.size, 0);
  if (CAPS.maxInputBytes && totalBytes > CAPS.maxInputBytes) {
    const limitMb = Math.round(CAPS.maxInputBytes / 1024 / 1024);
    throw new Error(`参考图加起来太大（超过 ${limitMb}MB），去掉几张或先压缩再试`);
  }

  const imageParts: InlinePart[] = (
    await Promise.all(request.inputPaths.map((item) => readInlineImage(item, "参考图")))
  ).map((image) => ({ inlineData: image }));

  const aspectRatio =
    request.aspectRatio && ratioIsEnforced("gemini", request.aspectRatio)
      ? request.aspectRatio
      : undefined;
  if (request.aspectRatio && !aspectRatio) {
    // 静默降级最难查：图出来了、比例不对、界面上什么都没说。至少留一行痕
    console.warn("[Gemini] 比例不被支持，已改为跟随参考图", {
      userId: "local",
      action: "gemini.image.aspectRatio",
      requested: request.aspectRatio,
      model: request.model,
    });
  }

  // 不传 responseModalities：图像模型本来就输出图，多传一个约束只会多一种 400 的可能
  const body = {
    contents: [{ parts: [...imageParts, { text: request.prompt }] }],
    ...(aspectRatio ? { generationConfig: { imageConfig: { aspectRatio } } } : {}),
  };

  const data = await withQuotaTracking(request.model, () =>
    geminiRequest<GenerateContentResponse>(`models/${request.model}:generateContent`, {
      method: "POST",
      body,
      signal: request.signal,
    }),
  );

  const parts = data.candidates?.[0]?.content?.parts || [];
  const image = parts.find((part) => part.inlineData)?.inlineData;
  const note = parts.map((part) => part.text || "").join("").trim();

  if (!image) {
    // 没出图的三种常见原因分开说：安全拦截、模型改口回了文字、以及纯粹的空响应
    const blockReason = data.promptFeedback?.blockReason;
    if (blockReason) throw new Error(`Gemini 拒绝了这次生成（${blockReason}），换个说法或换张参考图`);
    if (note) throw new Error(`Gemini 没有出图，它说：${note.slice(0, 200)}`);
    throw new Error("Gemini 返回了空结果，重试一次或换个模型");
  }

  await writeFile(request.outputPath, Buffer.from(image.data, "base64"));
  return { outputPath: request.outputPath, mimeType: image.mimeType, note };
}
