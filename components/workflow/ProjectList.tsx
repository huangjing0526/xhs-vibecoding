"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Field";
import CanvasPage from "@/components/workflow/CanvasPage";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import { AREAS } from "@/lib/capabilities";
import { describeProjectProgress, type VideoProject } from "@/lib/videoFactory";
import { isPublishedDraft, type ContentCard, type DraftNote } from "@/lib/xhsWorkflow";

/**
 * 项目页：全部交付的统一入口，图文和视频分两条 lane 各看各的——
 * 图文选题没有时间戳，硬和视频混排只能瞎排。
 * lane 由父级持有：从视频 lane 点进工厂再回来，还停在视频 lane。
 */

export type ProjectLane = "post" | "video";

interface ProjectListProps {
  notes: ContentCard[];
  drafts: DraftNote[];
  selectedTopicId: string | null;
  lane: ProjectLane;
  onLaneChange: (lane: ProjectLane) => void;
  onSelect: (topic: ContentCard) => void;
  onNew: () => void;
  onGenerateFromMaterials: () => void;
  videoProjects: VideoProject[];
  onSelectVideoProject: (project: VideoProject) => void;
  onNewVideoProject: () => void;
}

export type NoteStatus = "待写" | "待发" | "已发";

/** 一篇图文项目当前所处状态：没草稿=待写，有草稿未发=待发，已发布=已发。 */
export function getNoteStatus(topic: ContentCard, drafts: DraftNote[]): NoteStatus {
  const draft = drafts.find((item) => item.topicId === topic.topicId);
  if (!draft) return "待写";
  return isPublishedDraft(draft) ? "已发" : "待发";
}

const STATUS_TONE: Record<NoteStatus, BadgeTone> = {
  待写: "brand",
  待发: "warn",
  已发: "ok",
};

const FILTERS: Array<{ id: "all" | NoteStatus; label: string }> = [
  { id: "all", label: "全部" },
  { id: "待写", label: "待写" },
  { id: "待发", label: "待发" },
  { id: "已发", label: "已发" },
];

function noteTitle(topic: ContentCard): string {
  return topic.titleCandidates[0] || topic.coreViewpoint || "未命名项目";
}

function compactMeta(topic: ContentCard): string[] {
  return [
    topic.contentLane,
    topic.referencePool,
    topic.viralTitleStructure,
    topic.assetType,
  ].filter(Boolean) as string[];
}

/** 两条 lane 的项目卡共用同一副壳，悬停阴影不许各漂各的。 */
const CARD_SHELL = "h-full rounded-3xl border bg-surface p-4 text-left transition-all duration-150";
const CARD_IDLE = "border-line hover:border-brand-300 hover:shadow-card";

/** 两条 lane 共用的空态：一句话 + 一个去处。 */
function LaneEmpty({ text, actionLabel, onAction }: { text: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-muted">{text}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export default function ProjectList({
  notes,
  drafts,
  selectedTopicId,
  lane,
  onLaneChange,
  onSelect,
  onNew,
  onGenerateFromMaterials,
  videoProjects,
  onSelectVideoProject,
  onNewVideoProject,
}: ProjectListProps) {
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<"all" | NoteStatus>("all");

  const decorated = useMemo(
    () => notes.map((topic) => ({ topic, status: getNoteStatus(topic, drafts) })),
    [notes, drafts]
  );

  const counts = useMemo(() => {
    const base: Record<"all" | NoteStatus, number> = { all: decorated.length, 待写: 0, 待发: 0, 已发: 0 };
    decorated.forEach(({ status }) => (base[status] += 1));
    return base;
  }, [decorated]);

  const visible = decorated.filter(({ topic, status }) => {
    if (filter !== "all" && status !== filter) return false;
    if (keyword.trim()) {
      const text = `${noteTitle(topic)} ${topic.painPoint} ${topic.coreViewpoint}`.toLowerCase();
      if (!text.includes(keyword.trim().toLowerCase())) return false;
    }
    return true;
  });

  return (
    <CanvasPage
      title={
        <>
          项目 <span className="tabular-nums text-faint">{notes.length + videoProjects.length}</span>
        </>
      }
      subtitle={AREAS.projects.subtitle}
      action={
        lane === "post" ? (
          <Button variant="primary" onClick={onNew} icon={<Plus size={14} strokeWidth={2.6} />}>
            新建图文
          </Button>
        ) : (
          <Button variant="primary" onClick={onNewVideoProject} icon={<Plus size={14} strokeWidth={2.6} />}>
            新建视频
          </Button>
        )
      }
    >
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SegmentedControl
          value={lane}
          onChange={onLaneChange}
          ariaLabel="项目类型"
          compact
          options={[
            { value: "post", label: `图文 ${notes.length}` },
            { value: "video", label: `视频 ${videoProjects.length}` },
          ]}
        />
        {lane === "post" && (
          <div className="relative w-full sm:w-72">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索项目"
              className="bg-surface pl-9"
            />
          </div>
        )}
        {lane === "post" && (
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
                  filter === item.id ? "bg-ink text-white" : "bg-soft text-muted hover:bg-sunken"
                }`}
              >
                {item.label}
                <span className="ml-1 font-rounded tabular-nums opacity-70">{counts[item.id]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {lane === "post" ? (
          visible.length === 0 ? (
            <LaneEmpty
              text={notes.length === 0 ? "还没有图文项目" : "没有符合条件的项目"}
              actionLabel={notes.length === 0 ? "从素材生成选题" : undefined}
              onAction={notes.length === 0 ? onGenerateFromMaterials : undefined}
            />
          ) : (
            visible.map(({ topic, status }) => {
              const active = selectedTopicId === topic.topicId;
              return (
                <button
                  key={topic.recordId || topic.topicId}
                  type="button"
                  onClick={() => onSelect(topic)}
                  className={`${CARD_SHELL} ${active ? "border-brand-300 shadow-card" : CARD_IDLE}`}
                >
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                    <span className="truncate text-[15px] font-bold text-ink">{noteTitle(topic)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                    {topic.painPoint || topic.coreViewpoint}
                  </p>
                  {compactMeta(topic).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {compactMeta(topic).map((item) => (
                        <span
                          key={`${topic.topicId}-${item}`}
                          className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-faint ring-1 ring-inset ring-line"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          )
        ) : videoProjects.length === 0 ? (
          <LaneEmpty text="还没有视频项目" actionLabel="去视频工厂开一条" onAction={onNewVideoProject} />
        ) : (
          videoProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onSelectVideoProject(project)}
              className={`${CARD_SHELL} ${CARD_IDLE}`}
            >
              <div className="flex items-center gap-2">
                <Badge tone="brand">视频</Badge>
                <span className="truncate text-[15px] font-bold text-ink">{project.title}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">{describeProjectProgress(project)}</p>
              <p className="mt-1.5 text-[11px] text-faint">{project.updatedAt.slice(0, 10)} 更新</p>
            </button>
          ))
        )}
      </div>
    </CanvasPage>
  );
}
