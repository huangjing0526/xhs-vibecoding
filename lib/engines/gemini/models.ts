/**
 * 从 ListModels 现探可用模型，不写死清单。
 *
 * 跟 image-factory 探 `grok models` 是同一个原则：只放真探到的。
 * Gemini 的图像 / 视频模型换代很快（3.1 flash image、veo 3.1 都是近期才有的），
 * 写死一份清单迟早会让用户在下拉里选到一个已经下线的 id，然后整轮生成白跑。
 */

import { geminiRequest } from "./index";

export interface GeminiModel {
  id: string;
  label: string;
  /** 预览版模型随时会变，UI 上标出来让人心里有数 */
  preview: boolean;
}

interface ListModelsResponse {
  models?: Array<{
    name?: string;
    displayName?: string;
    supportedGenerationMethods?: string[];
  }>;
}

/** 图像模型认名字：它们和普通文本模型一样走 generateContent，方法名区分不出来。 */
const IMAGE_NAME = /(image|banana)/i;

/** 视频模型认方法：只有 Veo 系列是长任务，这个判断比认名字稳。 */
const VIDEO_METHOD = "predictLongRunning";

function toModel(name: string, displayName?: string): GeminiModel {
  return {
    id: name,
    label: displayName && displayName !== name ? `${name}（${displayName}）` : name,
    preview: name.includes("preview"),
  };
}

export interface GeminiModelCatalog {
  image: GeminiModel[];
  video: GeminiModel[];
}

/**
 * 拉一次模型目录并按用途分组。
 * 探不到就返回空数组——空下拉会让人去查为什么，猜一个 id 只会让人以为是模型本身不好用。
 */
export async function listGeminiModels(signal?: AbortSignal): Promise<GeminiModelCatalog> {
  const data = await geminiRequest<ListModelsResponse>("models?pageSize=200", { method: "GET", signal });
  const image: GeminiModel[] = [];
  const video: GeminiModel[] = [];

  for (const entry of data.models || []) {
    const name = (entry.name || "").replace(/^models\//, "");
    if (!name) continue;
    const methods = entry.supportedGenerationMethods || [];

    if (methods.includes(VIDEO_METHOD)) {
      video.push(toModel(name, entry.displayName));
    } else if (IMAGE_NAME.test(name) && methods.includes("generateContent")) {
      image.push(toModel(name, entry.displayName));
    }
  }

  // 正式版排在预览版前面：默认落到稳定的那个，想尝鲜的自己往下翻
  const stableFirst = (a: GeminiModel, b: GeminiModel) =>
    a.preview === b.preview ? a.id.localeCompare(b.id) : Number(a.preview) - Number(b.preview);

  return { image: image.sort(stableFirst), video: video.sort(stableFirst) };
}
