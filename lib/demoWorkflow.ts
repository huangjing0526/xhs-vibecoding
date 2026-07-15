import { DRAFT_STATUS, MATERIAL_STATUS, TOPIC_STATUS } from "@/lib/xhsWorkflow";
import type { WorkflowSnapshot } from "@/lib/workflowClient";

export const DEMO_SELECTED_MATERIAL_IDS = [
  "demo-material-01",
  "demo-material-02",
  "demo-material-03",
];

export const DEMO_SNAPSHOT: WorkflowSnapshot = {
  materials: [
    {
      recordId: "demo-material-01",
      sourceId: "DEMO-AGENT-CONTEXT",
      sourceType: "开发日报",
      date: "2026-05-25",
      summary: "用 Agent 写 CRM 字段逻辑时，模型漏掉了租户上下文和权限边界。",
      event: "AI 编程别急着写代码：先让 Agent 复述业务上下文",
      pitfall: "AI 容易只看当前文件，忽略租户、权限、字段显隐这些业务约束。",
      method: "开工前先让 Agent 输出影响范围清单：页面、接口、数据表、权限、测试点。",
      relatedTerm: "Agent 协作",
      status: MATERIAL_STATUS.pending,
    },
    {
      recordId: "demo-material-02",
      sourceId: "DEMO-HANDOFF",
      sourceType: "协作标准",
      date: "2026-05-25",
      summary: "长任务交接时，如果没有 Handoff，下一轮 AI 会重复探索甚至误改文件。",
      event: "一次跨会话开发里，Handoff 让 AI 少走了 40 分钟弯路",
      pitfall: "只记录结果，不记录决策原因，下一轮协作很难接上。",
      method: "Handoff 固定写当前状态、已验证命令、未完成风险、下一步动作。",
      relatedTerm: "Handoff",
      status: MATERIAL_STATUS.pending,
    },
    {
      recordId: "demo-material-03",
      sourceId: "DEMO-VALIDATION",
      sourceType: "问题记录",
      date: "2026-05-25",
      summary: "一次 UI 改动看似成功，但没有跑构建和浏览器预览，差点把样式状态带坏。",
      event: "改完 UI 后，我现在一定让 AI 做三层验证",
      pitfall: "只看代码 diff 不看真实页面，容易漏掉布局溢出和状态跳动。",
      method: "固定跑 tsc、lint/build，再用浏览器检查首屏、滚动、关键按钮状态。",
      relatedTerm: "验证闭环",
      status: MATERIAL_STATUS.pending,
    },
    {
      recordId: "demo-material-04",
      sourceId: "DEMO-COVER",
      sourceType: "封面经验",
      date: "2026-05-25",
      summary: "封面不是换字体颜色，而是背景、字号、布局和一句话钩子的整体配方。",
      event: "同一篇 AI Coding 笔记，用封面模板能更快稳定出图",
      pitfall: "只调颜色，不调信息层级，封面会像普通截图。",
      method: "先选情绪方向，再锁定主标题、副标题、色块比例和留白。",
      relatedTerm: "封面配方",
      status: MATERIAL_STATUS.pending,
    },
    {
      recordId: "demo-material-05",
      sourceId: "DEMO-REVIEW",
      sourceType: "数据复盘",
      date: "2026-05-25",
      summary: "阅读低不一定是内容差，可能是标题没有击中痛点或封面信息太弱。",
      event: "复盘低阅读笔记时，我把问题拆成选题、标题、封面、收藏价值四层",
      pitfall: "只看阅读量，不看收藏率和评论断点，会误判内容价值。",
      method: "用阅读量看点击，用收藏率看价值，用评论看表达是否清楚。",
      relatedTerm: "数据回流",
      status: MATERIAL_STATUS.pending,
    },
  ],
  glossary: [
    {
      recordId: "demo-term-01",
      term: "Agent 协作",
      explanation: "把 AI 当成有分工的协作者，而不是一次性问答工具。",
      misconception: "以为 Agent 越多越好，实际关键是边界清晰。",
      caseText: "让一个 Agent 审需求，一个 Agent 写代码，一个 Agent 做验证。",
      reusableAsset: "角色分工表 + 交接模板",
      titleAngle: "AI 编程别急着写代码，先分工",
    },
    {
      recordId: "demo-term-02",
      term: "Handoff",
      explanation: "跨会话交接文档，让下一轮 AI 能接着干。",
      misconception: "只写完成了什么，不写为什么这么做。",
      caseText: "长任务中记录已改文件、验证命令和未处理风险。",
      reusableAsset: "Handoff 四段式模板",
      titleAngle: "让 AI 少重复探索的交接模板",
    },
    {
      recordId: "demo-term-03",
      term: "验证闭环",
      explanation: "代码修改后，用类型、构建和真实预览确认结果。",
      misconception: "只要 AI 说改好了，就可以直接发。",
      caseText: "布局改完后跑 tsc、lint、build，再用浏览器看首屏。",
      reusableAsset: "发布前验证清单",
      titleAngle: "AI 写完代码后，真正重要的是这一步",
    },
  ],
  topics: [
    {
      topicId: "DEMO-TOPIC-AGENT",
      sourceMaterial: "DEMO-AGENT-CONTEXT\nDEMO-HANDOFF",
      relatedTerm: "Agent 协作 / Handoff",
      column: "避坑",
      targetReader: "产品经理/独立开发者",
      painPoint: "AI 写代码经常改得很快，但一到真实业务就漏上下文。",
      coreViewpoint: "AI Coding 的关键不是立刻写代码，而是先让 Agent 讲清楚边界。",
      realCase: "CRM 字段逻辑改动里，先补租户、权限、字段显隐上下文，返工明显减少。",
      reusableAsset: "开工前 5 问：影响哪些页面、接口、数据表、权限、测试点？",
      titleCandidates: [
        "AI 编程别急着写代码：先讲清楚 Agent 协作",
        "我让 AI 少返工的第一步，不是写 Prompt",
        "真实业务里，AI 最容易漏的是这件事",
      ],
      coverText: "AI 编程\n先别急着写代码",
      outline: ["常见误区", "真实踩坑", "Agent 分工", "可复用清单", "评论互动"],
      commentPrompt: "你用 AI 写代码时，更卡在需求描述，还是验收改 bug？",
      estimatedSaveValue: 5,
      status: TOPIC_STATUS.pending,
    },
    {
      topicId: "DEMO-TOPIC-VALIDATION",
      sourceMaterial: "DEMO-VALIDATION",
      relatedTerm: "验证闭环",
      column: "模板",
      targetReader: "AI Coding 新手",
      painPoint: "AI 说改好了，但页面一打开还是乱。",
      coreViewpoint: "把验证步骤模板化，才能让 AI 编程从能跑变成可交付。",
      realCase: "一次 UI 调整后，通过构建和浏览器检查发现横向溢出。",
      reusableAsset: "tsc / lint / build / 浏览器预览四步清单",
      titleCandidates: [
        "AI 写完代码后，我一定检查这 4 件事",
        "别让 AI 的“改好了”骗过你",
        "一个让 AI 代码更稳的验证清单",
      ],
      coverText: "AI 代码\n别只看 diff",
      outline: ["为什么只看 diff 不够", "四步验证", "常见漏点", "可复制模板"],
      commentPrompt: "你最常漏掉构建检查，还是浏览器预览？",
      estimatedSaveValue: 4,
      status: TOPIC_STATUS.pending,
    },
  ],
  drafts: [
    {
      noteId: "DEMO-NOTE-AGENT",
      topicId: "DEMO-TOPIC-AGENT",
      title: "AI 编程别急着写代码：先讲清楚 Agent 协作",
      coverText: "AI 编程\n先别急着写代码",
      content:
        "以前我用 AI 写代码，最容易犯的错就是：需求一说完，马上让它开写。\n\n后来做真实 CRM 项目才发现，AI 不是不会写，而是经常不知道业务边界在哪里。\n\n比如字段显隐、租户隔离、权限范围、表单和列表的联动，这些如果不先讲清楚，后面就会不停返工。\n\n我现在会先让 Agent 回答 5 个问题：\n1. 这个改动影响哪些页面？\n2. 会动到哪些接口和数据表？\n3. 权限和租户有没有风险？\n4. 哪些字段要同步检查？\n5. 最后怎么验证？\n\n这一步看似慢，其实最省时间。\n\n你用 AI 写代码时，更卡在需求描述，还是验收改 bug？",
      imageSuggestions: "首图放大字；第二张放 5 问清单；第三张放 Agent 分工示意。",
      tags: ["#AI编程", "#VibeCoding", "#Agent", "#Cursor", "#产品经理"],
      commentPrompt: "你用 AI 写代码时，更卡在需求描述，还是验收改 bug？",
      status: DRAFT_STATUS.pending,
    },
  ],
  metrics: [
    {
      noteId: "DEMO-NOTE-AGENT",
      title: "AI 编程别急着写代码：先讲清楚 Agent 协作",
      reads: 428,
      likes: 18,
      saves: 46,
      comments: 7,
      shares: 3,
      interactionRate: 74 / 428,
      saveRate: 46 / 428,
    },
    {
      noteId: "DEMO-NOTE-VALIDATION",
      title: "AI 写完代码后，我一定检查这 4 件事",
      reads: 236,
      likes: 9,
      saves: 31,
      comments: 4,
      shares: 2,
      interactionRate: 46 / 236,
      saveRate: 31 / 236,
    },
  ],
};

function stripMarkdown(text: string): string {
  return text
    .replace(/---[\s\S]*?---/, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/[-*]\s+/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function getMarkdownTitle(markdown: string): string {
  const frontmatterTitle = markdown.match(/^title:\s*(.+)$/m)?.[1]?.trim();
  const headingTitle = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return frontmatterTitle || headingTitle || "我的第一篇 AI Coding 笔记";
}

function getMarkdownId(markdown: string): string {
  const hash = Array.from(markdown).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 1000000, 17);
  return String(hash).padStart(6, "0");
}

export function createMarkdownDemoSnapshot(markdown: string): WorkflowSnapshot {
  const title = getMarkdownTitle(markdown);
  const plainText = stripMarkdown(markdown);
  const summary = plainText.slice(0, 180) || title;
  const id = getMarkdownId(markdown);
  const materialId = `MD-${id}`;
  const topicId = `DEMO-TOPIC-${id}`;
  const noteId = `DEMO-NOTE-${id}`;

  return {
    materials: [
      {
        recordId: `demo-md-material-${id}`,
        sourceId: materialId,
        sourceType: "Markdown",
        date: "",
        summary,
        event: title,
        pitfall: "内容里有真实经历，但还没有提炼成明确读者痛点。",
        method: "把经历改成：场景、卡点、做法、可收藏清单、评论问题。",
        relatedTerm: "AI Coding 复盘",
        status: MATERIAL_STATUS.pending,
      },
    ],
    glossary: DEMO_SNAPSHOT.glossary,
    topics: [
      {
        topicId,
        sourceMaterial: materialId,
        relatedTerm: "AI Coding 复盘",
        column: "案例",
        targetReader: "AI Coding 新手",
        painPoint: "想分享 AI 实践，但内容容易写成流水账。",
        coreViewpoint: "把一次经历拆成痛点和可复用资产，才更像值得收藏的小红书笔记。",
        realCase: summary,
        reusableAsset: "场景 -> 卡点 -> 做法 -> 清单 -> 评论问题",
        titleCandidates: [
          title,
          "这次 AI 实践，我最想复用的是这一步",
          "别把 AI Coding 笔记写成流水账",
        ],
        coverText: `${title.slice(0, 12)}\n别写成流水账`,
        outline: ["用一句话说痛点", "讲真实场景", "拆解做法", "给可收藏清单", "抛出评论问题"],
        commentPrompt: "你写 AI 实践笔记时，更卡在标题，还是正文结构？",
        estimatedSaveValue: 4,
        status: TOPIC_STATUS.pending,
      },
    ],
    drafts: [
      {
        noteId,
        topicId,
        title,
        coverText: `${title.slice(0, 12)}\n别写成流水账`,
        content: `这次经历最值得记录的，不是“我做了什么”，而是它能不能变成别人也能复用的方法。\n\n原始素材里最核心的场景是：${summary}\n\n如果直接写，很容易变成流水账。但小红书更需要先讲清楚：读者为什么要点进来？他能收藏什么？\n\n我会把它拆成 5 段：\n1. 先说痛点\n2. 再讲真实场景\n3. 说明踩坑点\n4. 给一张可收藏清单\n5. 用一个二选一问题收尾\n\n可直接复用的结构：场景 -> 卡点 -> 做法 -> 清单 -> 评论问题。\n\n你写 AI 实践笔记时，更卡在标题，还是正文结构？`,
        imageSuggestions: "首图放封面大字；第二张放 5 段结构；第三张放可收藏清单。",
        tags: ["#AI编程", "#VibeCoding", "#小红书运营", "#内容复盘"],
        commentPrompt: "你写 AI 实践笔记时，更卡在标题，还是正文结构？",
        status: DRAFT_STATUS.pending,
      },
    ],
    metrics: DEMO_SNAPSHOT.metrics,
  };
}
