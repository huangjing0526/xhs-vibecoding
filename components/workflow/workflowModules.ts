export type WorkflowModule = "overview" | "bloggers" | "assets" | "topics" | "rewrite" | "images" | "video" | "review";

export interface WorkflowModuleMeta {
  id: WorkflowModule;
  order: string;
  label: string;
  description: string;
  shortLabel: string;
}

export const WORKFLOW_MODULES: WorkflowModuleMeta[] = [
  {
    id: "bloggers",
    order: "01",
    label: "博主研究",
    shortLabel: "博主",
    description: "采集样本，蒸馏可复用的爆款判断路径。",
  },
  {
    id: "assets",
    order: "02",
    label: "内容资产",
    shortLabel: "资产",
    description: "沉淀素材和术语，选择本轮要生产的内容输入。",
  },
  {
    id: "topics",
    order: "03",
    label: "选题生成",
    shortLabel: "选题",
    description: "用素材和博主道库生成可发布的内容卡片。",
  },
  {
    id: "rewrite",
    order: "04",
    label: "爆款改写",
    shortLabel: "改写",
    description: "借博主判断路径改写标题、结构和正文。",
  },
  {
    id: "images",
    order: "05",
    label: "图片生成",
    shortLabel: "图片",
    description: "生成封面图和正文内容配图。",
  },
  {
    id: "video",
    order: "06",
    label: "视频生成",
    shortLabel: "视频",
    description: "生成口播稿、分镜、字幕和视频 Prompt。",
  },
  {
    id: "review",
    order: "07",
    label: "数据复盘",
    shortLabel: "复盘",
    description: "回填数据，找到下一轮选题和改写方向。",
  },
];

export const OVERVIEW_MODULE_META: WorkflowModuleMeta = {
  id: "overview",
  order: "00",
  label: "流水线总览",
  shortLabel: "总览",
  description: "采集到成片的全链路一图看全，点环节进入操作。",
};

export const NEXT_WORKFLOW_MODULE: Record<WorkflowModule, WorkflowModule> = {
  overview: "bloggers",
  bloggers: "assets",
  assets: "topics",
  topics: "rewrite",
  rewrite: "images",
  images: "video",
  video: "review",
  review: "topics",
};

export function getWorkflowModuleMeta(module: WorkflowModule): WorkflowModuleMeta {
  if (module === "overview") return OVERVIEW_MODULE_META;
  return WORKFLOW_MODULES.find((item) => item.id === module) || WORKFLOW_MODULES[0];
}
