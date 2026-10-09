"use client";

import { useRef } from "react";
import { BarChart3, RefreshCw, Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Stat from "@/components/ui/Stat";
import { hasReviewData, type ReviewActionLayer, type ReviewMetric, type ReviewResult } from "@/lib/xhsWorkflow";
import { copyToClipboard } from "@/lib/clipboard";

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

/** 页头主操作：选一份创作服务平台导出的 xlsx 就开始导入。 */
export function ImportStatsButton({
  onImport,
  importing,
  disabled,
}: {
  onImport: (file: File) => void;
  importing: boolean;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // 清掉值，同一个文件改完再选一次也能触发
          event.target.value = "";
          if (file) onImport(file);
        }}
      />
      <Button
        variant="primary"
        icon={<Upload size={15} />}
        loading={importing}
        disabled={disabled}
        title={disabled ? "连接飞书后才能导入" : "导入创作服务平台的笔记数据表"}
        onClick={() => inputRef.current?.click()}
      >
        导入数据
      </Button>
    </>
  );
}

/** 每行写回的是同一次复盘的总结，取出现最多的那句当「上次复盘」 */
function latestSummary(metrics: ReviewMetric[]): string {
  const counts = new Map<string, number>();
  for (const metric of metrics) {
    const summary = metric.conclusion?.summary;
    if (summary) counts.set(summary, (counts.get(summary) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export default function ReviewDashboard({ metrics, review, onGenerate, onCancel, generating }: ReviewDashboardProps) {
  const handleCarry = (advice: string) => {
    void copyToClipboard(advice, {
      successMessage: "已复制下次优化建议，可粘贴进新笔记",
      action: "review.carryNextAction",
    });
  };

  const sortedMetrics = [...metrics].sort((a, b) => b.reads - a.reads);
  // 刚标记发布、还没回填的行不进统计，否则一堆 0 会把均值拉低
  const withData = metrics.filter(hasReviewData);
  const awaitingCount = metrics.length - withData.length;
  const totalReads = withData.reduce((sum, item) => sum + item.reads, 0);
  const totalImpressions = withData.reduce((sum, item) => sum + (item.impressions ?? 0), 0);
  const averageSaveRate =
    withData.length > 0 ? withData.reduce((sum, item) => sum + item.saveRate, 0) / withData.length : 0;
  const lastSummary = latestSummary(metrics);
  // 整体封面点击率按总量算，而不是各条求平均——否则几十次曝光的笔记会把数字拉飞
  const overallClickRate = totalImpressions > 0 ? totalReads / totalImpressions : 0;

  return (
    <section className="grid gap-3 xl:grid-cols-2">
      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        <div className="flex gap-2 p-4">
          <Stat value={metrics.length} label="已发布" />
          {awaitingCount > 0 && <Stat value={awaitingCount} label="待回填" />}
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
                {metric.conclusion?.action && (
                  <div className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-muted">
                    <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 font-bold text-ink">{metric.conclusion.action}</span>
                    <span className="min-w-0">{metric.conclusion.diagnosis}</span>
                  </div>
                )}
              </div>
              {!hasReviewData(metric) ? (
                <div className="flex items-center justify-end text-xs text-faint">待回填数据</div>
              ) : (
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
              )}
            </div>
          ))}
          {metrics.length === 0 && <div className="p-10 text-center text-sm text-faint">暂无已发布笔记数据</div>}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        {review ? (
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1 rounded-2xl bg-soft px-4 py-3 text-sm font-semibold leading-6 text-ink">
                {review.summary}
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw size={14} />}
                onClick={onGenerate}
                loading={generating}
                disabled={withData.length === 0}
              >
                重新生成
              </Button>
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
              title={lastSummary ? "上次复盘" : "把发布后的数据回填后，生成复盘结论"}
              description={
                lastSummary ||
                (withData.length === 0 ? "页头「导入数据」，上传创作服务平台导出的笔记数据表。" : undefined)
              }
              action={
                <div className="flex items-center gap-2">
                  <Button variant="ai" size="lg" onClick={onGenerate} loading={generating} disabled={withData.length === 0}>
                    {generating ? "生成中" : lastSummary ? "重新复盘" : "生成复盘"}
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
