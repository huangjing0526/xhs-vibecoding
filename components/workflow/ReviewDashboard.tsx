import type { ReviewMetric, ReviewResult } from "@/lib/xhsWorkflow";

interface ReviewDashboardProps {
  metrics: ReviewMetric[];
  review: ReviewResult | null;
}

function toPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function ReviewDashboard({
  metrics,
  review,
}: ReviewDashboardProps) {
  const sortedMetrics = [...metrics].sort((a, b) => b.reads - a.reads);
  const totalReads = metrics.reduce((sum, item) => sum + item.reads, 0);
  const averageSaveRate = metrics.length > 0
    ? metrics.reduce((sum, item) => sum + item.saveRate, 0) / metrics.length
    : 0;

  return (
    <section className="grid gap-3 xl:grid-cols-[1fr_1fr]">
      <div className="border border-stone-300 bg-white">
        <div className="grid grid-cols-3 border-b border-stone-200 text-center">
          <div className="border-r border-stone-200 p-3">
            <div className="text-xl font-black text-stone-950 tabular-nums">{metrics.length}</div>
            <div className="mt-0.5 text-xs text-stone-500">已发布</div>
          </div>
          <div className="border-r border-stone-200 p-3">
            <div className="text-xl font-black text-stone-950 tabular-nums">{totalReads}</div>
            <div className="mt-0.5 text-xs text-stone-500">阅读</div>
          </div>
          <div className="p-3">
            <div className="text-xl font-black text-stone-950 tabular-nums">{toPercent(averageSaveRate)}</div>
            <div className="mt-0.5 text-xs text-stone-500">均收藏率</div>
          </div>
        </div>

        <div className="max-h-[calc(100vh-280px)] overflow-auto">
          {sortedMetrics.map((metric) => (
            <div key={metric.noteId} className="grid gap-3 border-b border-stone-100 p-3 last:border-b-0 md:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="text-xs font-bold text-stone-400">{metric.noteId}</div>
                <div className="mt-1 text-sm font-black text-stone-950">{metric.title || "未命名笔记"}</div>
              </div>
              <div className="grid grid-cols-3 text-center text-xs">
                <div>
                  <div className="font-black text-stone-950 tabular-nums">{metric.reads}</div>
                  <div className="mt-0.5 text-stone-500">阅读</div>
                </div>
                <div>
                  <div className="font-black text-teal-700 tabular-nums">{metric.saves}</div>
                  <div className="mt-0.5 text-stone-500">收藏</div>
                </div>
                <div>
                  <div className="font-black text-stone-700 tabular-nums">{toPercent(metric.interactionRate)}</div>
                  <div className="mt-0.5 text-stone-500">互动率</div>
                </div>
              </div>
            </div>
          ))}
          {metrics.length === 0 && (
            <div className="p-8 text-center text-sm text-stone-500">暂无已发布笔记数据</div>
          )}
        </div>
      </div>

      <div className="border border-stone-300 bg-white">
        {review ? (
          <div className="p-4">
            <div className="border-l-2 border-stone-950 bg-stone-50 px-3 py-2 text-sm font-semibold leading-6 text-stone-800">
              {review.summary}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-stone-500">继续放大</h3>
                <ul className="mt-2 space-y-1.5">
                  {review.topPatterns.map((item) => (
                    <li key={item} className="bg-teal-50 px-2.5 py-1.5 text-sm leading-6 text-teal-900">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-stone-500">优先修正</h3>
                <ul className="mt-2 space-y-1.5">
                  {review.weakPatterns.map((item) => (
                    <li key={item} className="bg-rose-50 px-2.5 py-1.5 text-sm leading-6 text-rose-900">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-3 border border-stone-200">
              {review.recordActions.map((action) => (
                <div key={`${action.noteId}-${action.action}`} className="grid gap-3 border-b border-stone-100 p-2.5 last:border-b-0 md:grid-cols-[0.6fr_0.45fr_1.4fr]">
                  <div className="text-xs font-bold text-stone-500">{action.noteId}</div>
                  <div className="text-sm font-black text-stone-950">{action.action}</div>
                  <div className="text-sm leading-6 text-stone-700">{action.reason}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[420px] items-center justify-center text-sm text-stone-500">
            点顶部生成复盘后显示结论
          </div>
        )}
      </div>
    </section>
  );
}
