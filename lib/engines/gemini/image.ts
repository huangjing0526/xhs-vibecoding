/**
 * Gemini 生图：generateContent 一次同步返回，图就在响应体里。
 *
 * 比 codex / grok 那条 CLI 通道简单一截——不用起进程、不用约定输出路径、
 * 不用跑完再去目录里捞产物，也就不需要 findOutputImage 那套兜底。
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { geminiRequest } from "./index";
import { describeQuotaError, recordQuotaExhausted } from "./quota";

/** Gemini 认的比例。不在表里的一律不传，让模型跟随参考图——传错值会直接 400。 */
const SUPPORTED_ASPECT_RATIOS = new Set([
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
]);

/** 整个请求体（含所有参考图的 base64）的上限。留出余量，超了先说清楚而不是让 Google 拒。 */
const MAX_INLINE_BYTES = 18 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

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

async function readInlineImage(filePath: string): Promise<InlinePart> {
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) {
    throw new Error(`参考图 ${path.basename(filePath)} 的格式不支持，只能用 png / jpg / webp`);
  }
  const bytes = await readFile(filePath);
  return { inlineData: { mimeType, data: bytes.toString("base64") } };
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
  const imageParts: InlinePart[] = [];
  let totalBytes = 0;

  for (const inputPath of request.inputPaths) {
    const part = await readInlineImage(inputPath);
    totalBytes += part.inlineData.data.length;
    if (totalBytes > MAX_INLINE_BYTES) {
      throw new Error("参考图加起来太大（超过 18MB），去掉几张或先压缩再试");
    }
    imageParts.push(part);
  }

  const aspectRatio = request.aspectRatio && SUPPORTED_ASPECT_RATIOS.has(request.aspectRatio)
    ? request.aspectRatio
    : undefined;

  // 不传 responseModalities：图像模型本来就输出图，多传一个约束只会多一种 400 的可能
  const body = {
    contents: [{ parts: [...imageParts, { text: request.prompt }] }],
    ...(aspectRatio ? { generationConfig: { imageConfig: { aspectRatio } } } : {}),
  };

  let data: GenerateContentResponse;
  try {
    data = await geminiRequest<GenerateContentResponse>(
      `models/${request.model}:generateContent`,
      { method: "POST", body, signal: request.signal },
    );
  } catch (error) {
    const verdict = describeQuotaError(error);
    if (verdict.isQuota) {
      await recordQuotaExhausted(request.model, verdict);
      throw new Error(verdict.message);
    }
    throw error;
  }

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
