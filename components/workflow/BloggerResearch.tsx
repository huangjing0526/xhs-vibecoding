"use client";

import { useMemo, useState } from "react";
import { Radar } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Input, Textarea } from "@/components/ui/Field";
import {
  DEMO_BLOGGER_PROFILES,
  DEMO_BLOGGER_SAMPLES,
  getDistillationForBlogger,
  getSamplesForBlogger,
  type BloggerDistillation,
  type BloggerProfile,
  type BloggerSample,
  type DaokuSlot,
} from "@/lib/bloggerWorkflow";
import { distillBlogger } from "@/lib/workflowClient";
import type { Notice } from "@/components/workflow/types";

interface BloggerResearchProps {
  selectedDistillation: BloggerDistillation | null;
  onDistillationChange: (distillation: BloggerDistillation) => void;
  onNotice: (notice: Notice) => void;
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
  onDistillationChange,
  onNotice,
}: BloggerResearchProps) {
  const [profiles] = useState<BloggerProfile[]>(DEMO_BLOGGER_PROFILES);
  const [samples, setSamples] = useState<BloggerSample[]>(DEMO_BLOGGER_SAMPLES);
  const [selectedBloggerId, setSelectedBloggerId] = useState(profiles[0]?.id || "");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [distilling, setDistilling] = useState(false);

  const selectedProfile = profiles.find((profile) => profile.id === selectedBloggerId) || profiles[0];
  const visibleSamples = useMemo(
    () => samples.filter((sample) => sample.bloggerId === selectedBloggerId),
    [samples, selectedBloggerId]
  );
  const distillation =
    selectedDistillation?.bloggerId === selectedBloggerId
      ? selectedDistillation
      : getDistillationForBlogger(selectedBloggerId);

  const handleAddSample = () => {
    if (!draftTitle.trim() && !draftContent.trim()) return;
    const nextSample: BloggerSample = {
      id: `sample-${Date.now().toString(36)}`,
      bloggerId: selectedBloggerId,
      title: draftTitle.trim() || "未命名样本",
      content: draftContent.trim(),
      tags: [],
      coverDescription: "手动录入样本",
    };
    setSamples((current) => [nextSample, ...current]);
    setDraftTitle("");
    setDraftContent("");
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
      console.error("[BloggerResearch] 蒸馏失败", {
        userId: "local",
        action: "daoku.distill",
        bloggerId: selectedProfile.id,
        error,
      });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "蒸馏失败，稍后再试" });
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
            <p className="mt-1 text-sm leading-6 text-muted">{selectedProfile?.positioning}</p>
          </div>
          <select
            value={selectedBloggerId}
            onChange={(event) => setSelectedBloggerId(event.target.value)}
            className="h-10 rounded-xl border border-line bg-soft px-3.5 text-sm font-bold text-ink outline-none transition-colors focus:border-brand-300 focus:bg-surface focus:ring-4 focus:ring-brand-500/10"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
        <div className="space-y-4">
          <section className="rounded-3xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-bold text-ink">样本录入</h3>
                <p className="mt-1 text-xs text-faint">第一阶段支持手动粘贴，不自动抓取平台数据。</p>
              </div>
              <Button variant="primary" onClick={handleAddSample} disabled={!draftTitle.trim() && !draftContent.trim()}>
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
                <div className="p-10 text-center text-sm text-faint">还没有样本，先录入 3-5 条代表性内容样本。</div>
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
