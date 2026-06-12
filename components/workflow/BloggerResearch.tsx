"use client";

import { useMemo, useState } from "react";
import {
  createFallbackBloggerDistillation,
  DEMO_BLOGGER_PROFILES,
  DEMO_BLOGGER_SAMPLES,
  getDistillationForBlogger,
  getSamplesForBlogger,
  type BloggerDistillation,
  type BloggerProfile,
  type BloggerSample,
} from "@/lib/bloggerWorkflow";

interface BloggerResearchProps {
  selectedDistillation: BloggerDistillation | null;
  onDistillationChange: (distillation: BloggerDistillation) => void;
}

function metricText(sample: BloggerSample): string {
  const metrics = sample.metrics;
  if (!metrics) return "未记录数据";
  return `${metrics.views || 0} 阅读 · ${metrics.saves || 0} 收藏`;
}

function PatternList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-[#E5E5EA] bg-white p-3">
      <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#A1A1A6]">{title}</h4>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="text-sm leading-6 text-[#1D1D1F]">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function BloggerResearch({
  selectedDistillation,
  onDistillationChange,
}: BloggerResearchProps) {
  const [profiles] = useState<BloggerProfile[]>(DEMO_BLOGGER_PROFILES);
  const [samples, setSamples] = useState<BloggerSample[]>(DEMO_BLOGGER_SAMPLES);
  const [selectedBloggerId, setSelectedBloggerId] = useState(profiles[0]?.id || "");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

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

  const handleDistill = () => {
    if (!selectedProfile) return;
    const fallback = createFallbackBloggerDistillation(selectedProfile, visibleSamples);
    onDistillationChange(fallback);
  };

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-[#E5E5EA] bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A1A1A6]">Blogger Profile</div>
            <h3 className="mt-1 text-xl font-semibold text-[#1D1D1F]">{selectedProfile?.name || "未选择博主"}</h3>
            <p className="mt-1 text-sm leading-6 text-[#6E6E73]">{selectedProfile?.positioning}</p>
          </div>
          <select
            value={selectedBloggerId}
            onChange={(event) => setSelectedBloggerId(event.target.value)}
            className="rounded-lg border border-[#D2D2D7] bg-white px-3 py-2 text-sm font-semibold text-[#1D1D1F] outline-none focus:border-[#FF2442]"
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
          <section className="rounded-lg border border-[#E5E5EA] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#1D1D1F]">样本录入</h3>
                <p className="mt-1 text-xs text-[#6E6E73]">第一阶段支持手动粘贴，不自动抓取平台数据。</p>
              </div>
              <button
                type="button"
                onClick={handleAddSample}
                disabled={!draftTitle.trim() && !draftContent.trim()}
                className="rounded-lg bg-[#1D1D1F] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6]"
              >
                新增样本
              </button>
            </div>
            <input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="粘贴爆款标题"
              className="mt-4 w-full rounded-lg border border-[#D2D2D7] bg-white px-3 py-2 text-sm outline-none focus:border-[#FF2442]"
            />
            <textarea
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              placeholder="粘贴正文、封面描述或你观察到的内容规律"
              rows={4}
              className="mt-2 w-full resize-y rounded-lg border border-[#D2D2D7] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#FF2442]"
            />
          </section>

          <section className="rounded-lg border border-[#E5E5EA] bg-white">
            <div className="flex items-center justify-between border-b border-[#E5E5EA] px-4 py-3">
              <h3 className="text-base font-semibold text-[#1D1D1F]">样本列表</h3>
              <span className="text-sm font-semibold tabular-nums text-[#6E6E73]">{visibleSamples.length}</span>
            </div>
            <div className="max-h-[520px] overflow-auto">
              {visibleSamples.map((sample) => (
                <article key={sample.id} className="border-b border-[#E5E5EA] px-4 py-3 last:border-b-0">
                  <div className="text-sm font-semibold leading-6 text-[#1D1D1F]">{sample.title}</div>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#6E6E73]">{sample.content}</p>
                  <div className="mt-2 text-xs font-medium text-[#A1A1A6]">{metricText(sample)}</div>
                </article>
              ))}
              {visibleSamples.length === 0 && (
                <div className="p-8 text-center text-sm text-[#6E6E73]">还没有样本，先粘贴 3-5 条代表性笔记。</div>
              )}
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-[#E5E5EA] bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-[#1D1D1F]">蒸馏结果</h3>
              <p className="mt-1 text-xs text-[#6E6E73]">借道不借皮，只沉淀判断路径。</p>
            </div>
            <button
              type="button"
              onClick={handleDistill}
              className="rounded-lg bg-[#FF2442] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(255,36,66,0.18)]"
            >
              蒸馏博主
            </button>
          </div>

          {distillation ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg bg-[#FFF1F3] p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#FF2442]">核心道</div>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#1D1D1F]">{distillation.coreDao}</p>
              </div>
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
            <div className="mt-4 flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-[#D2D2D7] text-sm text-[#6E6E73]">
              点击「蒸馏博主」生成第一版道库。
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
