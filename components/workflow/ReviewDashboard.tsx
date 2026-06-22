import { toast } from "sonner";
import type { ReviewActionLayer, ReviewMetric, ReviewResult } from "@/lib/xhsWorkflow";

interface ReviewDashboardProps {
  metrics: ReviewMetric[];
  review: ReviewResult | null;
  onGenerate: () => void;
  generating: boolean;
}

// 下次优化层级配色，与发布前质检维度一一对应
const LAYER_STYLE: Record<ReviewActionLayer, string> = {
  选题: "bg-indigo-50 text-indigo-700",
  钩子: "bg-amber-50 text-amber-700",
  封面: "bg-purple-50 text-purple-700",
  标签: "bg-sky-50 text-sky-700",
  引导: "bg-teal-50 text-teal-700",
  内容价值: "bg-rose-50 text-rose-700",
};

function toPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function ReviewDashboard({
  metrics,
  review,
  onGenerate,
  generating,
}: ReviewDashboardProps) {
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

            {review.nextActions?.length > 0 && (
              <div className="mt-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-stone-500">下次优化</h3>
                <ul className="mt-2 space-y-1.5">
                  {review.nextActions.map((action, index) => (
                    <li
                      key={`${action.layer}-${index}`}
                      className="flex items-start gap-2 border border-stone-200 px-2.5 py-2"
                    >
                      <span
                        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${LAYER_STYLE[action.layer] ?? "bg-stone-100 text-stone-600"}`}
                      >
                        {action.layer}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm leading-6 text-stone-800">{action.advice}</div>
                        {action.basedOn && <div className="mt-0.5 text-xs text-stone-400">依据：{action.basedOn}</div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCarry(action.advice)}
                        className="shrink-0 border border-stone-300 px-2 py-1 text-xs font-bold text-stone-600 transition-colors hover:border-stone-950 hover:text-stone-950"
                      >
                        带入
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-sm text-stone-500">
            <p>把发布后的数据回填后，生成复盘结论。</p>
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating || metrics.length === 0}
              className="bg-[#FF2442] px-5 py-2 text-sm font-black text-white transition-colors hover:bg-[#E01E3A] disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
            >
              {generating ? "生成中…" : "生成复盘"}
            </button>
            {metrics.length === 0 && <p className="text-xs text-stone-400">先发布一篇笔记才有数据可复盘</p>}
          </div>
        )}
      </div>
    </section>
  );
}
