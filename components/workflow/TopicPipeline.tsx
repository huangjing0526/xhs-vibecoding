import type { ContentCard, MaterialItem } from "@/lib/xhsWorkflow";

interface TopicPipelineProps {
  topics: ContentCard[];
  selectedTopic: ContentCard | null;
  selectedMaterials: MaterialItem[];
  onSelectTopic: (topic: ContentCard) => void;
}

function truncate(text: string, maxLength = 58): string {
  if (!text) return "未填写";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function splitMultiValue(text: string): string[] {
  return text
    .split(/\n|\/|、|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function StatusBadge({ value }: { value?: string }) {
  const color = value === "待写" ? "bg-rose-50 text-rose-700" : "bg-stone-100 text-stone-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold ${color}`}>
      {value || "未设置"}
    </span>
  );
}

export default function TopicPipeline({
  topics,
  selectedTopic,
  selectedMaterials,
  onSelectTopic,
}: TopicPipelineProps) {
  const selectedTerms = splitMultiValue(selectedTopic?.relatedTerm || "");
  const sourceCount = splitMultiValue(selectedTopic?.sourceMaterial || "").length;
  const caseCount = splitMultiValue(selectedTopic?.realCase || "").length;

  return (
    <section className="grid gap-3 xl:grid-cols-[0.82fr_1.18fr]">
      <div className="border border-stone-300 bg-white">
        {selectedMaterials.length > 0 && (
          <div className="border-b border-stone-200 bg-stone-50 px-3 py-2">
            <div className="text-xs font-bold text-stone-500">
              本轮提炼素材 <span className="font-black text-stone-950 tabular-nums">{selectedMaterials.length}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {selectedMaterials.slice(0, 6).map((item) => (
                <span key={item.recordId} className="bg-white px-2 py-0.5 text-xs font-semibold text-stone-600">
                  {truncate(item.event || item.summary || item.sourceId, 20)}
                </span>
              ))}
              {selectedMaterials.length > 6 && (
                <span className="bg-white px-2 py-0.5 text-xs font-semibold text-stone-400">
                  +{selectedMaterials.length - 6}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="max-h-[calc(100vh-260px)] overflow-auto">
          {topics.map((topic) => {
            const isSelected = selectedTopic?.topicId === topic.topicId;
            const relatedTerms = splitMultiValue(topic.relatedTerm);
            const mergedSourceCount = splitMultiValue(topic.sourceMaterial).length;
            const mergedCaseCount = splitMultiValue(topic.realCase).length;
            return (
              <button
                key={`${topic.recordId || topic.topicId}-${topic.titleCandidates[0] || topic.coreViewpoint}`}
                type="button"
                onClick={() => onSelectTopic(topic)}
                className={`block w-full border-b border-stone-100 p-3 text-left transition-colors last:border-b-0 ${
                  isSelected ? "bg-stone-950 text-white" : "bg-white hover:bg-stone-50"
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge value={topic.status} />
                  {topic.daokuVerdict && (
                    <span
                      className={`px-1.5 py-0.5 text-xs font-black ${
                        topic.daokuVerdict === "偏爆"
                          ? isSelected
                            ? "bg-rose-500 text-white"
                            : "bg-rose-100 text-rose-700"
                          : isSelected
                          ? "bg-stone-700 text-stone-300"
                          : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {topic.daokuVerdict}
                      {topic.daokuScore ? ` ${topic.daokuScore}` : ""}
                    </span>
                  )}
                  <span className={`text-xs font-semibold ${isSelected ? "text-stone-400" : "text-stone-400"}`}>
                    {topic.topicId}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-black leading-5">{topic.titleCandidates[0] || topic.coreViewpoint}</h3>
                <div className={`mt-1.5 text-xs leading-5 ${isSelected ? "text-stone-300" : "text-stone-500"}`}>
                  {truncate(topic.painPoint, 76)}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {relatedTerms.length > 0 && (
                    <span className={`px-1.5 py-0.5 text-xs font-semibold ${isSelected ? "bg-stone-800 text-teal-300" : "bg-teal-50 text-teal-700"}`}>
                      {relatedTerms.slice(0, 2).join(" / ")}
                    </span>
                  )}
                  {mergedSourceCount > 1 && (
                    <span className={`px-1.5 py-0.5 text-xs font-semibold ${isSelected ? "bg-stone-800 text-stone-300" : "bg-stone-100 text-stone-600"}`}>
                      素材 {mergedSourceCount}
                    </span>
                  )}
                  {mergedCaseCount > 1 && (
                    <span className={`px-1.5 py-0.5 text-xs font-semibold ${isSelected ? "bg-stone-800 text-stone-300" : "bg-stone-100 text-stone-600"}`}>
                      案例 {mergedCaseCount}
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {topics.length === 0 && (
            <div className="p-10 text-center text-sm text-stone-500">选题池暂无记录，先从素材页生成</div>
          )}
        </div>
      </div>

      <article className="border border-stone-300 bg-white">
        {selectedTopic ? (
          <div className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={selectedTopic.status} />
              <span className="bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
                {selectedTopic.column || "案例"}
              </span>
              <span className="text-xs text-stone-500">
                {sourceCount} 素材 · {caseCount} 案例
              </span>
            </div>

            <h3 className="mt-3 text-xl font-black leading-7 text-stone-950">
              {selectedTopic.titleCandidates[0] || selectedTopic.coreViewpoint}
            </h3>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <div className="bg-rose-50 p-3">
                <div className="text-xs font-black text-rose-700">读者痛点</div>
                <p className="mt-1.5 text-sm font-semibold leading-6 text-rose-950">{selectedTopic.painPoint || "未填写"}</p>
              </div>
              <div className="bg-teal-50 p-3">
                <div className="text-xs font-black text-teal-700">可收藏资产</div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold leading-6 text-teal-950">{truncate(selectedTopic.reusableAsset, 180)}</p>
              </div>
            </div>

            {(selectedTopic.daokuVerdict || selectedTopic.daokuScore || selectedTopic.daokuHit) && (
              <div className="mt-3 border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-amber-700">道库质量分</span>
                  {selectedTopic.daokuVerdict && (
                    <span
                      className={`px-2 py-0.5 text-xs font-black ${
                        selectedTopic.daokuVerdict === "偏爆"
                          ? "bg-rose-600 text-white"
                          : selectedTopic.daokuVerdict === "偏哑"
                          ? "bg-stone-300 text-stone-700"
                          : "bg-amber-200 text-amber-900"
                      }`}
                    >
                      {selectedTopic.daokuVerdict}
                    </span>
                  )}
                  {selectedTopic.daokuScore && (
                    <span className="text-sm font-black tabular-nums text-amber-900">{selectedTopic.daokuScore}</span>
                  )}
                </div>
                {selectedTopic.daokuHit && (
                  <p className="mt-1.5 text-xs font-semibold leading-5 text-amber-800">命中道：{selectedTopic.daokuHit}</p>
                )}
              </div>
            )}

            <div className="mt-3 bg-stone-50 p-3">
              <div className="text-xs font-black text-stone-500">核心观点</div>
              <p className="mt-1.5 text-sm font-semibold leading-6 text-stone-800">{selectedTopic.coreViewpoint || "未填写"}</p>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs font-black text-stone-500">关联知识点</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(selectedTerms.length > 0 ? selectedTerms : ["未填写"]).map((term) => (
                    <span key={term} className="bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700">
                      {term}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-black text-stone-500">评论引导</div>
                <p className="mt-1.5 text-sm font-semibold leading-6 text-stone-700">{selectedTopic.commentPrompt || "未填写"}</p>
              </div>
            </div>

            <div className="mt-3">
              <div className="text-xs font-black text-stone-500">正文结构</div>
              <ol className="mt-1.5 divide-y divide-stone-100 border border-stone-200">
                {(selectedTopic.outline.length > 0 ? selectedTopic.outline : ["未填写"]).map((item, index) => (
                  <li key={`${item}-${index}`} className="grid grid-cols-[auto_1fr] gap-3 px-3 py-2 text-sm font-semibold leading-6 text-stone-700">
                    <span className="font-black text-stone-400 tabular-nums">0{index + 1}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[420px] items-center justify-center text-sm text-stone-500">
            选择一条选题查看详情
          </div>
        )}
      </article>
    </section>
  );
}
