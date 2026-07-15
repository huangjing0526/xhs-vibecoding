import { NextRequest } from "next/server";
import { apiError, apiOk, readJsonBody } from "../_utils";
import { fieldToText, getFeishuRecord, updateFeishuRecord, WorkflowTableName } from "@/lib/feishu";
import { generateWorkflowJson } from "@/lib/workflowAi";
import { DEFAULT_TARGET_ID, assetAspect, parseTarget } from "@/lib/targets";
import {
  buildCoverPlanPrompt,
  contentCardToCoverInput,
  CoverInput,
  CoverPlan,
  coverPlanToCoverConfig,
  createFallbackCoverPlan,
  draftToCoverInput,
  getCoverSourceKey,
  mapCoverToFeishuFields,
} from "@/lib/coverWorkflow";
import {
  type DraftNote,
  hasContentCardContent,
  hasDraftContent,
  normalizeContentCard,
} from "@/lib/xhsWorkflow";

interface CoversRequest {
  sourceType?: "topic" | "draft";
  recordId?: string;
  input?: CoverInput;
  writeBack?: boolean;
  renderImage?: boolean;
}

function normalizeDraftFromRecord(recordId: string, fields: Record<string, unknown>): DraftNote {
  return {
    noteId: fieldToText(fields["笔记ID"]) || recordId,
    topicId: fieldToText(fields["选题ID"]),
    target: parseTarget(fieldToText(fields["发布目标"])),
    title: fieldToText(fields["最终标题"] ?? fields["标题"]),
    coverText: fieldToText(fields["封面文案"]),
    content: fieldToText(fields["正文"]),
    imageSuggestions: fieldToText(fields["配图建议"]),
    tags: fieldToText(fields["话题标签"]).split(/\s+/).filter(Boolean),
    commentPrompt: fieldToText(fields["评论引导"]),
    status: fieldToText(fields["发布状态"]),
  };
}

async function resolveInput(body: CoversRequest): Promise<{ input: CoverInput; tableName?: WorkflowTableName; recordId?: string }> {
  if (body.input) {
    return { input: body.input };
  }

  if (!body.recordId) {
    throw new Error("请提供 recordId 或 input");
  }

  if (body.sourceType === "draft") {
    const record = await getFeishuRecord("draft", body.recordId);
    const draft = normalizeDraftFromRecord(record.record_id, record.fields);
    if (!hasDraftContent(draft)) {
      throw new Error("当前草稿内容为空，无法生成封面");
    }
    return { input: draftToCoverInput(draft), tableName: "draft", recordId: body.recordId };
  }

  const record = await getFeishuRecord("topic", body.recordId);
  const card = normalizeContentCard(record);
  if (!hasContentCardContent(card)) {
    throw new Error("当前选题内容为空，无法生成封面");
  }
  return { input: contentCardToCoverInput(card), tableName: "topic", recordId: body.recordId };
}

async function renderCoverImage(origin: string, coverConfig: unknown): Promise<string> {
  const response = await fetch(`${origin}/api/cover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(coverConfig),
  });

  if (!response.ok) {
    throw new Error("封面图片渲染失败");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<CoversRequest>(request, "covers.readJson");
    const writeBack = body.writeBack !== false;
    const { input, tableName, recordId } = await resolveInput(body);
    const fallbackPlan = createFallbackCoverPlan(input);

    const aiResult = await generateWorkflowJson<CoverPlan>({
      action: "covers.generatePlan",
      prompt: buildCoverPlanPrompt(input, assetAspect(DEFAULT_TARGET_ID, "cover")),
      fallback: fallbackPlan,
      maxTokens: 1800,
    });

    const plan = {
      ...fallbackPlan,
      ...aiResult.result,
    };
    const coverConfig = {
      ...coverPlanToCoverConfig(plan),
      sourceKey: getCoverSourceKey(input),
    };

    let writeResult: unknown = null;
    if (writeBack && tableName && recordId) {
      writeResult = await updateFeishuRecord(tableName, recordId, mapCoverToFeishuFields(plan, coverConfig));
    }

    const coverImageDataUrl = body.renderImage
      ? await renderCoverImage(request.nextUrl.origin, coverConfig)
      : undefined;

    return apiOk(
      {
        input,
        plan,
        coverConfig,
        coverImageDataUrl,
        writeBack: Boolean(writeBack && tableName && recordId),
        writeResult,
        usedFallback: aiResult.usedFallback,
        provider: aiResult.provider,
      },
      aiResult.usedFallback ? "未检测到 AI 配置，已用规则生成封面方案" : "封面方案生成成功"
    );
  } catch (error) {
    return apiError(error, "covers.generate", "封面生成失败");
  }
}
