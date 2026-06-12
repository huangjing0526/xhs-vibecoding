import type { BloggerDistillation } from "@/lib/bloggerWorkflow";
import type { ContentCard, DraftNote } from "@/lib/xhsWorkflow";
import { NEXT_WORKFLOW_MODULE, getWorkflowModuleMeta, type WorkflowModule } from "./workflowModules";

interface ContentContextPanelProps {
  activeModule: WorkflowModule;
  bloggerDistillation: BloggerDistillation | null;
  selectedMaterialsCount: number;
  selectedTopic: ContentCard | null;
  selectedDraft: DraftNote | null;
  coverReady: boolean;
  contentImageReady: boolean;
  videoReady: boolean;
  reviewSummary?: string;
  primaryLabel: string;
  primaryDisabled: boolean;
  onPrimaryAction: () => void;
  onOpenModule: (module: WorkflowModule) => void;
}

function clip(text: string | undefined, maxLength = 58): string {
  if (!text) return "尚未确认";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getTopicTitle(topic: ContentCard | null): string {
  if (!topic) return "尚未选择选题";
  return topic.titleCandidates?.[0] || topic.coreViewpoint || topic.topicId || "尚未选择选题";
}

function getDraftTitle(draft: DraftNote | null): string {
  if (!draft) return "尚未生成草稿";
  return draft.title || draft.noteId || "未命名草稿";
}

function ContextRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border-b border-[#E5E5EA] py-3 last:border-b-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A1A1A6]">{label}</div>
      <div className="mt-1 text-sm font-semibold leading-5 text-[#1D1D1F]">{value}</div>
      {detail && <div className="mt-1 text-xs leading-5 text-[#6E6E73]">{detail}</div>}
    </div>
  );
}

export default function ContentContextPanel({
  activeModule,
  bloggerDistillation,
  selectedMaterialsCount,
  selectedTopic,
  selectedDraft,
  coverReady,
  contentImageReady,
  videoReady,
  reviewSummary,
  primaryLabel,
  primaryDisabled,
  onPrimaryAction,
  onOpenModule,
}: ContentContextPanelProps) {
  const nextModule = NEXT_WORKFLOW_MODULE[activeModule];
  const nextMeta = getWorkflowModuleMeta(nextModule);

  return (
    <aside className="flex h-full flex-col border-l border-[#E5E5EA] bg-[#FBFBFD]">
      <div className="border-b border-[#E5E5EA] px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A1A1A6]">
          Content Package
        </div>
        <h2 className="mt-1 text-base font-semibold text-[#1D1D1F]">当前内容包</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4">
        <ContextRow
          label="博主道库"
          value={bloggerDistillation ? clip(bloggerDistillation.coreDao, 36) : "尚未选择道库"}
          detail={bloggerDistillation ? "已作为选题、改写和视频方案参考" : "先在博主研究中蒸馏样本"}
        />
        <ContextRow
          label="本轮素材"
          value={`${selectedMaterialsCount} 条`}
          detail={selectedMaterialsCount > 0 ? "已进入当前内容包" : "从内容资产中选择素材"}
        />
        <ContextRow
          label="当前选题"
          value={clip(getTopicTitle(selectedTopic), 42)}
          detail={selectedTopic?.painPoint ? `痛点：${clip(selectedTopic.painPoint, 44)}` : undefined}
        />
        <ContextRow
          label="当前草稿"
          value={clip(getDraftTitle(selectedDraft), 42)}
          detail={selectedDraft?.status ? `状态：${selectedDraft.status}` : undefined}
        />
        <ContextRow
          label="图片"
          value={coverReady || contentImageReady ? "已有图片资产" : "待生成"}
          detail={`封面：${coverReady ? "已生成" : "待生成"} · 内容图：${contentImageReady ? "已生成" : "待生成"}`}
        />
        <ContextRow
          label="视频"
          value={videoReady ? "视频方案已生成" : "待生成视频方案"}
          detail="第一阶段输出口播稿、分镜和 Prompt"
        />
        <ContextRow
          label="复盘"
          value={reviewSummary ? clip(reviewSummary, 42) : "暂无复盘结论"}
          detail={reviewSummary ? "可回到选题生成下一轮方向" : "发布并回填数据后生成"}
        />
      </div>

      <div className="border-t border-[#E5E5EA] p-4">
        <button
          type="button"
          onClick={onPrimaryAction}
          disabled={primaryDisabled}
          className="w-full rounded-lg bg-[#FF2442] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(255,36,66,0.18)] transition-colors hover:bg-[#e61f3a] disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6] disabled:shadow-none"
        >
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={() => onOpenModule(nextModule)}
          className="mt-2 w-full rounded-lg px-4 py-2 text-sm font-semibold text-[#6E6E73] transition-colors hover:bg-white hover:text-[#1D1D1F]"
        >
          下一步：{nextMeta.label}
        </button>
      </div>
    </aside>
  );
}
