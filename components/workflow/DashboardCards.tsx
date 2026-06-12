import { hasGeneratedCover, type ContentCard, type DraftNote, type GlossaryItem, type MaterialItem, type ReviewMetric } from "@/lib/xhsWorkflow";

export type WorkflowStage = "source" | "topics" | "drafts" | "covers" | "review";

interface DashboardCardsProps {
  materials: MaterialItem[];
  glossary: GlossaryItem[];
  topics: ContentCard[];
  drafts: DraftNote[];
  metrics: ReviewMetric[];
  activeStage: WorkflowStage;
  onStageChange: (stage: WorkflowStage) => void;
}

const STAGES: Array<{ id: WorkflowStage; label: string; accent: string }> = [
  { id: "source", label: "素材", accent: "bg-stone-950" },
  { id: "topics", label: "选题", accent: "bg-rose-600" },
  { id: "drafts", label: "草稿", accent: "bg-amber-500" },
  { id: "covers", label: "图片", accent: "bg-teal-700" },
  { id: "review", label: "复盘", accent: "bg-indigo-700" },
];

function countByStatus<T extends { status?: string }>(items: T[], status: string): number {
  return items.filter((item) => item.status === status).length;
}

export default function DashboardCards({
  materials,
  glossary: _glossary,
  topics,
  drafts,
  metrics,
  activeStage,
  onStageChange,
}: DashboardCardsProps) {
  const topicReadyCount = countByStatus(topics, "待写");
  const draftReadyCount = drafts.filter((draft) => draft.status === "待发布" || draft.status === "待排期").length;
  const reviewedCount = metrics.filter((metric) => metric.reads > 0).length;
  const coverCount = [...topics, ...drafts].filter(hasGeneratedCover).length;

  const values: Record<WorkflowStage, number> = {
    source: materials.length,
    topics: topicReadyCount,
    drafts: draftReadyCount,
    covers: coverCount,
    review: reviewedCount,
  };

  return (
    <aside className="border border-stone-300 bg-white">
      <div className="px-3 py-3">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-stone-400">XHS Operating Loop</p>
        <h2 className="mt-1 text-base font-black leading-5 text-stone-950">内容生产闭环</h2>
      </div>

      <nav className="flex gap-1 overflow-x-auto p-2 sm:grid sm:grid-cols-5 sm:overflow-visible xl:block xl:space-y-1">
        {STAGES.map((stage, index) => {
          const isActive = activeStage === stage.id;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onStageChange(stage.id)}
              className={`grid min-w-[110px] flex-none grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2.5 text-left transition-colors sm:min-w-0 xl:w-full ${
                isActive
                  ? "bg-stone-950 text-white"
                  : "bg-white text-stone-950 hover:bg-stone-100"
              }`}
            >
              <span className={`h-2 w-2 ${stage.accent}`} />
              <span className="min-w-0">
                <span className={`block text-[11px] font-black ${isActive ? "text-stone-400" : "text-stone-400"}`}>
                  0{index + 1}
                </span>
                <span className="block text-sm font-black leading-5">{stage.label}</span>
              </span>
              <span className={`text-base font-black tabular-nums ${isActive ? "text-white" : "text-stone-950"}`}>
                {values[stage.id]}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
