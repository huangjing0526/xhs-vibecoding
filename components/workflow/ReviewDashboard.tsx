"use client";

import { toast } from "sonner";
import { BarChart3 } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Stat from "@/components/ui/Stat";
import type { ReviewActionLayer, ReviewMetric, ReviewResult } from "@/lib/xhsWorkflow";

interface ReviewDashboardProps {
  metrics: ReviewMetric[];
  review: ReviewResult | null;
  onGenerate: () => void;
  onCancel: () => void;
  generating: boolean;
}

// 下次优化层级配色，与发布前质检维度一一对应
const LAYER_STYLE: Record<ReviewActionLayer, string> = {
  选题: "bg-brand-50 text-brand-600",
  钩子: "bg-warn/10 text-warn",
  封面: "bg-brand-100 text-brand-700",
  标签: "bg-sky-50 text-sky-700",
  引导: "bg-ok/10 text-ok",
  内容价值: "bg-danger/10 text-danger",
};

function toPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function ReviewDashboard({ metrics, review, onGenerate, onCancel, generating }: ReviewDashboardProps) {
  const handleCarry = async (advice: string) => {
    try {
      await navigator.clipboard.writeText(advice);
      toast.success("已复制下次优化建议，可粘贴进新笔记");
    } catch (error) {
      console.error("[ReviewDashboard] 复制失败", { action: "review.carryNextAction", error });
      toast.error("复制失败，请手动选择文本");
    }
  };

  const sortedMetrics = [...metrics].sort((a, b) => b.reads - a.reads);
  const totalReads = metrics.reduce((sum, item) => sum + item.reads, 0);
  const totalImpressions = metrics.reduce((sum, item) => sum + (item.impressions ?? 0), 0);
  const averageSaveRate =
    metrics.length > 0 ? metrics.reduce((sum, item) => sum + item.saveRate, 0) / metrics.length : 0;
  // 整体封面点击率按总量算，而不是各条求平均——否则几十次曝光的笔记会把数字拉飞
  const overallClickRate = totalImpressions > 0 ? totalReads / totalImpressions : 0;

  return (
    <section className="grid gap-3 xl:grid-cols-2">
      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        <div className="flex gap-2 p-4">
          <Stat value={metrics.length} label="已发布" />
          {totalImpressions > 0 && <Stat value={totalImpressions} label="曝光" />}
          <Stat value={totalReads} label="阅读" />
          {totalImpressions > 0 && <Stat value={toPercent(overallClickRate)} label="封面点击率" />}
          <Stat value={toPercent(averageSaveRate)} label="均收藏率" tone="ok" />
        </div>

        <div className="max-h-[calc(100vh-320px)] overflow-auto border-t border-line">
          {sortedMetrics.map((metric) => (
            <div
              key={metric.noteId}
              className="grid gap-3 border-b border-line px-4 py-3 last:border-b-0 md:grid-cols-[1.2fr_0.8fr]"
            >
              <div className="min-w-0">
                <div className="font-mono text-[11px] font-bold text-faint">{metric.noteId}</div>
                <div className="mt-1 text-sm font-bold leading-6 text-ink">{metric.title || "未命名笔记"}</div>
              </div>
              <div className="grid grid-cols-4 text-center text-xs">
                <div>
                  <div className="font-rounded font-bold tabular-nums text-muted">
                    {metric.impressions ?? "—"}
                  </div>
                  <div className="mt-0.5 text-faint">曝光</div>
                </div>
                <div>
                  <div className="font-rounded font-bold tabular-nums text-ink">{metric.reads}</div>
                  <div className="mt-0.5 text-faint">
                    {metric.coverClickRate === undefined ? "阅读" : `阅读 ${toPercent(metric.coverClickRate)}`}
                  </div>
                </div>
                <div>
                  <div className="font-rounded font-bold tabular-nums text-ok">{metric.saves}</div>
                  <div className="mt-0.5 text-faint">收藏</div>
                </div>
                <div>
                  <div className="font-rounded font-bold tabular-nums text-muted">
                    {toPercent(metric.interactionRate)}
                  </div>
                  <div className="mt-0.5 text-faint">互动率</div>
                </div>
              </div>
            </div>
          ))}
          {metrics.length === 0 && <div className="p-10 text-center text-sm text-faint">暂无已发布笔记数据</div>}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        {review ? (
          <div className="p-5">
            <div className="rounded-2xl bg-soft px-4 py-3 text-sm font-semibold leading-6 text-ink">
              {review.summary}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">继续放大</h3>
                <ul className="mt-2 space-y-1.5">
                  {review.topPatterns.map((item) => (
                    <li key={item} className="rounded-xl bg-ok/8 px-3 py-2 text-sm leading-6 text-ok">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">优先修正</h3>
                <ul className="mt-2 space-y-1.5">
                  {review.weakPatterns.map((item) => (
                    <li key={item} className="rounded-xl bg-danger/8 px-3 py-2 text-sm leading-6 text-danger">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {review.nextActions?.length > 0 && (
              <div className="mt-4">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">下次优化</h3>
                <ul className="mt-2 space-y-1.5">
                  {review.nextActions.map((action, index) => (
                    <li
                      key={`${action.layer}-${index}`}
                      className="flex items-start gap-2.5 rounded-2xl border border-line px-3 py-2.5"
                    >
                      <span
                        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          LAYER_STYLE[action.layer] ?? "bg-soft text-muted"
                        }`}
                      >
                        {action.layer}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm leading-6 text-ink">{action.advice}</div>
                        {action.basedOn && <div className="mt-0.5 text-xs text-faint">依据：{action.basedOn}</div>}
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => handleCarry(action.advice)}>
                        带入
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 overflow-hidden rounded-2xl border border-line">
              {review.recordActions.map((action) => (
                <div
                  key={`${action.noteId}-${action.action}`}
                  className="grid gap-3 border-b border-line px-3 py-2.5 last:border-b-0 md:grid-cols-[0.6fr_0.45fr_1.4fr]"
                >
                  <div className="font-mono text-[11px] font-bold text-faint">{action.noteId}</div>
                  <div className="text-sm font-bold text-ink">{action.action}</div>
                  <div className="text-sm leading-6 text-muted">{action.reason}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[420px] items-center justify-center p-6">
            <EmptyState
              bare
              icon={<BarChart3 size={22} />}
              title="把发布后的数据回填后，生成复盘结论"
              description={metrics.length === 0 ? "先发布一篇笔记才有数据可复盘。" : undefined}
              action={
                <div className="flex items-center gap-2">
                  <Button variant="ai" size="lg" onClick={onGenerate} loading={generating} disabled={metrics.length === 0}>
                    {generating ? "生成中" : "生成复盘"}
                  </Button>
                  {generating && (
                    <Button variant="ghost" size="lg" onClick={onCancel}>
                      取消
                    </Button>
                  )}
                </div>
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}
