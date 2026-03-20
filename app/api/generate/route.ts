import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { calculateViralityScore } from "@/lib/ai";

// AI Provider 类型
type AIProvider = "openai" | "anthropic" | "siliconflow" | "custom" | "mock";

const MAX_FREE_USES = 3;

// 共享 API Key 配置（服务端环境变量）
function getSharedConfig(): { provider: AIProvider; apiKey: string; model: string; baseURL?: string } | null {
  const apiKey = process.env.SHARED_API_KEY;
  if (!apiKey) return null;

  const provider = (process.env.SHARED_API_PROVIDER || "siliconflow") as AIProvider;
  const model = process.env.SHARED_API_MODEL || "Qwen/Qwen2.5-7B-Instruct";
  const baseURL = process.env.SHARED_API_BASE;

  return { provider, apiKey, model, baseURL };
}

function detectProvider(clientConfig?: any): AIProvider {
  if (clientConfig?.provider) {
    const providerKey =
      clientConfig.provider === "openai" ? "openaiKey" :
      clientConfig.provider === "anthropic" ? "anthropicKey" :
      clientConfig.provider === "siliconflow" ? "siliconflowKey" :
      "customKey";
    if (clientConfig[providerKey]) return clientConfig.provider;
  }
  if (process.env.SILICONFLOW_API_KEY) return "siliconflow";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.CUSTOM_API_KEY && process.env.CUSTOM_API_BASE) return "custom";

  // 尝试共享 Key
  const shared = getSharedConfig();
  if (shared) return "shared" as any; // special marker

  return "mock";
}

function calculateAIScore(content: string): number {
  let score = 0;
  const aiWords = ["首先", "其次", "此外", "总之", "综上", "因此", "然而"];
  for (const word of aiWords) {
    if (content.includes(word)) score += 10;
  }
  const sentences = content.split(/[。！？]/).filter((s) => s.trim());
  if (sentences.length > 3) {
    const lengths = sentences.map((s) => s.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lengths.length;
    if (variance < 50) score += 15;
  }
  const informalWords = ["哈哈", "笑死", "救命", "绝了", "真的"];
  const informalCount = informalWords.filter((w) => content.includes(w)).length;
  if (informalCount < 2) score += 10;
  return Math.min(100, score);
}

function generateMockResponse(_prompt: string) {
  return {
    title: "Day 5 | 用AI写了个自动化脚本，省了3小时！",
    titleVariants: [
      "Day 5 | 用AI写了个自动化脚本，省了3小时！",
      "不会代码的我，竟然用AI做出了自动化工具",
      "这个AI编程技巧，打工人必看！",
    ],
    content: `救命！今天用AI写了个自动化脚本，直接省了3小时工作量 😭

话说公司每天都要处理一堆Excel数据，手动复制粘贴真的要命...

于是我跟AI说了我的需求，结果它给我生成了一个Python脚本 🔧

中间踩了个坑：路径写错了跑不起来 😅
还好AI很耐心，一步步帮我debug，最后终于跑通了 ✅

现在一键运行，3秒搞定之前3小时的活儿！

真的，不会代码也能用AI编程，太香了 ✨

姐妹们有没有类似的需求？评论区聊聊～`,
    tags: ["#vibecoding", "#AI编程", "#程序员日常", "#效率工具", "#自动化", "#Python", "#打工人"],
    firstComment: "有姐妹想要教程吗？点赞过100我出详细版！🙋‍♀️",
  };
}

// 读取免费试用次数
function getFreeUseCount(request: NextRequest): number {
  const cookie = request.cookies.get("vibenote_free_uses");
  if (!cookie) return 0;
  try {
    return JSON.parse(cookie.value).count || 0;
  } catch {
    return 0;
  }
}

export async function POST(request: NextRequest) {
  const { prompt, config: clientConfig, test } = await request.json();

  if (!prompt) {
    return new Response(JSON.stringify({ error: "Prompt is required" }), { status: 400 });
  }

  let detectedProvider = detectProvider(clientConfig);
  let useSharedKey = false;
  let freeTrialRemaining: number | undefined;

  // 共享 Key 模式：检查免费次数
  if (detectedProvider === ("shared" as any)) {
    const usedCount = getFreeUseCount(request);
    if (usedCount >= MAX_FREE_USES) {
      return new Response(
        JSON.stringify({ error: "免费试用次数已用完，请配置自己的 API Key 继续使用" }),
        { status: 403 }
      );
    }
    useSharedKey = true;
    freeTrialRemaining = MAX_FREE_USES - usedCount - 1;
  }

  const encoder = new TextEncoder();

  // 准备 cookie header（仅共享模式需要）
  let setCookieHeader: string | undefined;
  if (useSharedKey) {
    const usedCount = getFreeUseCount(request);
    const newCount = usedCount + 1;
    const cookieValue = JSON.stringify({ count: newCount });
    // 30 天过期
    setCookieHeader = `vibenote_free_uses=${encodeURIComponent(cookieValue)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax`;
  }

  const readableStream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let rawText = "";
        let actualProvider: AIProvider;
        let apiKey: string;
        let baseURL: string | undefined;
        let model: string;

        if (useSharedKey) {
          const shared = getSharedConfig()!;
          actualProvider = shared.provider;
          apiKey = shared.apiKey;
          model = shared.model;
          baseURL = shared.baseURL;

          // 为 siliconflow 设默认 baseURL
          if (actualProvider === "siliconflow" && !baseURL) {
            baseURL = "https://api.siliconflow.cn/v1";
          }
        } else {
          actualProvider = detectedProvider;
          apiKey = "";
          baseURL = undefined;
          model = "";
        }

        if (actualProvider === "mock") {
          const mockResult = generateMockResponse(prompt);
          const fullText = JSON.stringify(mockResult, null, 2);
          const chunkSize = 10;
          for (let i = 0; i < fullText.length; i += chunkSize) {
            rawText += fullText.slice(i, i + chunkSize);
            send({ type: "chunk", text: fullText.slice(i, i + chunkSize) });
            await new Promise((r) => setTimeout(r, 12));
          }
        } else if (actualProvider === "anthropic") {
          const finalKey = useSharedKey ? apiKey : (clientConfig?.anthropicKey || process.env.ANTHROPIC_API_KEY);
          const finalModel = useSharedKey ? model : (clientConfig?.anthropicModel || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20251001");
          const anthropic = new Anthropic({ apiKey: finalKey });

          const stream = await anthropic.messages.create({
            model: finalModel,
            max_tokens: 2000,
            messages: [{ role: "user", content: prompt }],
            stream: true,
          });

          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              rawText += event.delta.text;
              send({ type: "chunk", text: event.delta.text });
            }
          }
        } else {
          // OpenAI-compatible: openai, siliconflow, custom
          let finalKey: string;
          let finalBaseURL: string | undefined;
          let finalModel: string;

          if (useSharedKey) {
            finalKey = apiKey;
            finalBaseURL = baseURL;
            finalModel = model;
          } else if (actualProvider === "siliconflow") {
            finalKey = clientConfig?.siliconflowKey || process.env.SILICONFLOW_API_KEY || "";
            finalBaseURL = "https://api.siliconflow.cn/v1";
            finalModel = clientConfig?.siliconflowModel || process.env.SILICONFLOW_MODEL || "Qwen/Qwen2.5-7B-Instruct";
          } else if (actualProvider === "custom") {
            finalKey = clientConfig?.customKey || process.env.CUSTOM_API_KEY || "";
            finalBaseURL = clientConfig?.customBase || process.env.CUSTOM_API_BASE;
            finalModel = clientConfig?.customModel || process.env.CUSTOM_MODEL || "gpt-3.5-turbo";
          } else {
            finalKey = clientConfig?.openaiKey || process.env.OPENAI_API_KEY || "";
            finalModel = clientConfig?.openaiModel || process.env.OPENAI_MODEL || "gpt-4o-mini";
          }

          const openai = new OpenAI({ apiKey: finalKey, baseURL: finalBaseURL });
          const completion = await openai.chat.completions.create({
            model: finalModel,
            messages: [{ role: "user", content: prompt }],
            stream: true,
          });

          for await (const chunk of completion) {
            const text = chunk.choices[0]?.delta?.content || "";
            if (text) {
              rawText += text;
              send({ type: "chunk", text });
            }
          }
        }

        // Test mode: skip JSON parsing, just confirm API connectivity
        if (test) {
          send({ type: "done", result: { status: "ok", text: rawText.slice(0, 100) } });
        } else {
          // Parse final JSON — handle both raw JSON and markdown code blocks
          const codeBlockMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          const rawJsonMatch = rawText.match(/\{[\s\S]*\}/);
          const jsonStr = codeBlockMatch ? codeBlockMatch[1] : rawJsonMatch ? rawJsonMatch[0] : null;
          if (!jsonStr) {
            console.error("[Generate] Raw response (no JSON found):", rawText.slice(0, 500));
            throw new Error("模型未返回有效 JSON，请尝试重新生成");
          }

          const result = JSON.parse(jsonStr);
          const aiScore = calculateAIScore(result.content || "");
          const titleScores = (result.titleVariants || []).map(
            (t: string) => calculateViralityScore(t).score
          );

          send({
            type: "done",
            result: {
              ...result,
              aiScore,
              titleScores,
              ...(freeTrialRemaining !== undefined ? { freeTrialRemaining } : {}),
            },
          });
        }
      } catch (error: any) {
        console.error("Generate error:", error);

        let errorMessage = "生成失败，请检查 API 配置";
        if (error.message?.includes("API key")) {
          errorMessage = "API Key 无效，请检查配置";
        } else if (error.message?.includes("Connection") || error.code === "ERR_SSL_PACKET_LENGTH_TOO_LONG") {
          errorMessage = "API 连接失败，请检查 Base URL 是否正确（需要 https:// 开头）";
        } else if (error.status === 401) {
          errorMessage = "API Key 认证失败";
        } else if (error.status === 429) {
          errorMessage = "API 请求过于频繁，请稍后重试";
        } else if (error.message) {
          errorMessage = `生成失败: ${error.message}`;
        }

        send({ type: "error", message: errorMessage });
      } finally {
        controller.close();
      }
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  };

  if (setCookieHeader) {
    headers["Set-Cookie"] = setCookieHeader;
  }

  return new Response(readableStream, { headers });
}
