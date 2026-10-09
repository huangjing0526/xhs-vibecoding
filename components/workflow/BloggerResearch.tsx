"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Radar } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Input, Textarea } from "@/components/ui/Field";
import {
  makeManualSample,
  type BloggerDistillation,
  type BloggerProfile,
  type BloggerSample,
  type DaokuSlot,
} from "@/lib/bloggerWorkflow";
import { addBloggerSample, createBlogger, distillBlogger, listBloggers } from "@/lib/workflowClient";
import type { Notice } from "@/components/workflow/types";

interface BloggerResearchProps {
  selectedDistillation: BloggerDistillation | null;
  /** 已落盘的道库模板：选中的博主蒸馏过，就直接显示那一份 */
  savedDistillations: BloggerDistillation[];
  onDistillationChange: (distillation: BloggerDistillation) => void;
  onNotice: (notice: Notice) => void;
  onError: (action: string, error: unknown) => void;
}

function metricText(sample: BloggerSample): string {
  const metrics = sample.metrics;
  if (!metrics) return "未记录数据";
  return `${metrics.views || 0} 阅读 · ${metrics.saves || 0} 收藏`;
}

function PatternList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{title}</h4>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="text-sm leading-6 text-ink">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 槽位单独一栏：道说「怎么判断」，槽位说「拿你的什么去填」，缺了它这条蒸馏就不是模板。 */
function SlotList({ slots }: { slots: DaokuSlot[] }) {
  return (
    <section className="rounded-2xl border border-line bg-soft p-4">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
        槽位 · 复刻时你要补的
      </h4>
      <ul className="mt-2 space-y-1.5">
        {slots.map((slot) => (
          <li key={slot.id} className="text-sm leading-6 text-ink">
            <span className="font-bold">{slot.label}</span>
            <span className="text-muted"> · {slot.hint}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function BloggerResearch({
  selectedDistillation,
  savedDistillations,
  onDistillationChange,
  onNotice,
  onError,
}: BloggerResearchProps) {
  const [profiles, setProfiles] = useState<BloggerProfile[]>([]);
  const [samples, setSamples] = useState<BloggerSample[]>([]);
  // null = 还在读；false = 没配对标表，读到的是 demo，新增只留在本页
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [selectedBloggerId, setSelectedBloggerId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [distilling, setDistilling] = useState(false);
  const [savingSample, setSavingSample] = useState(false);
  const [newBlogger, setNewBlogger] = useState<{ name: string; positioning: string } | null>(null);
  const [savingBlogger, setSavingBlogger] = useState(false);

  useEffect(() => {
    let active = true;
    listBloggers()
      .then((data) => {
        if (!active) return;
        setProfiles(data.profiles);
        setSamples(data.samples);
        setPersisted(data.persisted);
        setSelectedBloggerId((current) => current || data.profiles[0]?.id || "");
      })
      .catch((error) => onError("bloggers.list", error));
    return () => {
      active = false;
    };
  }, [onError]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedBloggerId) || profiles[0];
  const visibleSamples = useMemo(
    () => samples.filter((sample) => sample.bloggerId === selectedBloggerId),
    [samples, selectedBloggerId]
  );
  const distillation =
    selectedDistillation?.bloggerId === selectedBloggerId
      ? selectedDistillation
      : savedDistillations.find((item) => item.bloggerId === selectedBloggerId) || null;

  const handleAddSample = async () => {
    if (!selectedBloggerId || (!draftTitle.trim() && !draftContent.trim())) return;
    const input = { bloggerId: selectedBloggerId, title: draftTitle.trim(), content: draftContent.trim() };
    setSavingSample(true);
    try {
      const sample = persisted ? await addBloggerSample(input) : makeManualSample(`sample-${crypto.randomUUID()}`, input);
      setSamples((current) => [sample, ...current]);
      setDraftTitle("");
      setDraftContent("");
    } catch (error) {
      onError("bloggers.samples.create", error);
    } finally {
      setSavingSample(false);
    }
  };

  const handleCreateBlogger = async () => {
    if (!newBlogger?.name.trim()) return;
    setSavingBlogger(true);
    try {
      const profile = await createBlogger({ name: newBlogger.name.trim(), positioning: newBlogger.positioning.trim() });
      setProfiles((current) => [...current, profile]);
      setSelectedBloggerId(profile.id);
      setNewBlogger(null);
    } catch (error) {
      onError("bloggers.create", error);
    } finally {
      setSavingBlogger(false);
    }
  };

  // 蒸馏走服务端：本机没配 AI 时后端自己落到关键词骨架，这里只管把结果交上去
  const handleDistill = async () => {
    if (!selectedProfile || distilling) return;
    setDistilling(true);
    try {
      const { distillation: distilled, usedFallback } = await distillBlogger(selectedProfile, visibleSamples);
      onDistillationChange(distilled);
      if (usedFallback) {
        onNotice({ type: "info", message: "未检测到 AI 配置，这版道是按关键词规则出的骨架，建议人工过一遍" });
      }
    } catch (error) {
      onError("daoku.distill", error);
    } finally {
      setDistilling(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">对标博主</div>
            <h3 className="mt-1 font-rounded text-xl font-bold text-ink">{selectedProfile?.name || "未选择博主"}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{selectedProfile?.positioning}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedBloggerId}
              onChange={(event) => setSelectedBloggerId(event.target.value)}
              className="h-10 rounded-xl border border-line bg-soft px-3.5 text-sm font-bold text-ink outline-none transition-colors focus:border-brand-300 focus:bg-surface focus:ring-4 focus:ring-brand-500/10"
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.platform ? `${profile.name} · ${profile.platform}` : profile.name}
                </option>
              ))}
            </select>
            {persisted && (
              <Button variant="secondary" icon={<Plus size={15} />} onClick={() => setNewBlogger({ name: "", positioning: "" })}>
                新建博主
              </Button>
            )}
          </div>
        </div>
        {newBlogger && (
          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 md:flex-row md:items-center">
            <Input
              value={newBlogger.name}
              onChange={(event) => setNewBlogger({ ...newBlogger, name: event.target.value })}
              placeholder="博主名字"
              className="md:w-48"
              autoFocus
            />
            <Input
              value={newBlogger.positioning}
              onChange={(event) => setNewBlogger({ ...newBlogger, positioning: event.target.value })}
              placeholder="一句话定位（可选）"
              className="flex-1"
            />
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={handleCreateBlogger} loading={savingBlogger} disabled={!newBlogger.name.trim()}>
                添加
              </Button>
              <Button variant="ghost" onClick={() => setNewBlogger(null)}>
                取消
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
        <div className="space-y-4">
          <section className="rounded-3xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-bold text-ink">样本录入</h3>
                <p className="mt-1 text-xs text-faint">
                  {persisted === false ? "未配置对标表，样本只留在本页。" : "粘贴的样本存进飞书「对标笔记」表。"}
                </p>
              </div>
              <Button
                variant="primary"
                onClick={handleAddSample}
                loading={savingSample}
                disabled={!selectedBloggerId || (!draftTitle.trim() && !draftContent.trim())}
              >
                新增样本
              </Button>
            </div>
            <Input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="粘贴爆款标题"
              className="mt-4"
            />
            <Textarea
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              placeholder="粘贴正文、封面描述或你观察到的内容规律"
              rows={4}
              className="mt-2"
            />
          </section>

          <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="text-[15px] font-bold text-ink">样本列表</h3>
              <span className="font-rounded text-sm font-bold tabular-nums text-faint">{visibleSamples.length}</span>
            </div>
            <div className="max-h-[520px] overflow-auto">
              {visibleSamples.map((sample) => (
                <article key={sample.id} className="border-b border-line px-5 py-3.5 last:border-b-0">
                  <div className="text-sm font-bold leading-6 text-ink">{sample.title}</div>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{sample.content}</p>
                  <div className="mt-2 text-xs font-medium text-faint">{metricText(sample)}</div>
                </article>
              ))}
              {visibleSamples.length === 0 && (
                <div className="p-10 text-center text-sm text-faint">还没有样本，先粘贴 3-5 条代表性笔记。</div>
              )}
            </div>
          </section>
        </div>

        <section className="rounded-3xl border border-line bg-surface p-5 shadow-card">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-[15px] font-bold text-ink">蒸馏结果</h3>
              <p className="mt-1 text-xs text-faint">借道不借皮，只沉淀判断路径。</p>
            </div>
            <Button variant="ai" onClick={handleDistill} loading={distilling} icon={<Radar size={15} />}>
              {distilling ? "蒸馏中" : "蒸馏博主"}
            </Button>
          </div>

          {distillation ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl bg-brand-50 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-600">核心道</div>
                <p className="mt-2 text-sm font-semibold leading-6 text-ink">{distillation.coreDao}</p>
              </div>
              <SlotList slots={distillation.slots} />
              <div className="grid gap-3 md:grid-cols-2">
                <PatternList title="选题道" items={distillation.topicDao} />
                <PatternList title="标题道" items={distillation.titlePatterns} />
                <PatternList title="正文道" items={distillation.contentPatterns} />
                <PatternList title="视觉道" items={distillation.visualPatterns} />
                <PatternList title="语气" items={distillation.toneRules} />
                <PatternList title="禁区" items={distillation.boundaries} />
              </div>
            </div>
          ) : (
            <div className="mt-4 min-h-[360px]">
              <EmptyState
                icon={<Radar size={22} />}
                title="还没有道库"
                description="点右上「蒸馏博主」，从样本里提炼出第一版判断路径。"
              />
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
