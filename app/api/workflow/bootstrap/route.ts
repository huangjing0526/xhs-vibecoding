import { apiOk } from "../../feishu/_utils";
import { DEMO_SNAPSHOT } from "@/lib/demoWorkflow";
import { getMissingFeishuConfig, type WorkflowTableName } from "@/lib/feishu";
import { DEFAULT_LOCAL_DOCS_SOURCE_DIR } from "@/lib/localDocs";
import { DEFAULT_TOPIC_POOL_DIR } from "@/lib/topicPool";
import { getWorkflowAIProvider } from "@/lib/workflowAi";

const WORKFLOW_TABLES: WorkflowTableName[] = ["material", "glossary", "topic", "draft", "review"];

export async function GET() {
  const missingFeishuConfig = getMissingFeishuConfig(WORKFLOW_TABLES);
  const feishuReady = missingFeishuConfig.length === 0;
  const aiProvider = getWorkflowAIProvider();

  return apiOk(
    {
      mode: feishuReady ? "connected" : "demo",
      snapshot: feishuReady ? null : DEMO_SNAPSHOT,
      config: {
        feishuReady,
        missingFeishuConfig,
        aiProvider,
        aiReady: aiProvider !== "mock",
        localDocsSourceDir: DEFAULT_LOCAL_DOCS_SOURCE_DIR,
        topicPoolDir: DEFAULT_TOPIC_POOL_DIR,
      },
    },
    feishuReady ? "工作流配置已就绪" : "未检测到完整飞书配置，已准备 Demo 工作流"
  );
}
