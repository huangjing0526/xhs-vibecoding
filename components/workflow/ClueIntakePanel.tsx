"use client";

import { useState } from "react";
import { extractClues } from "@/lib/workflowClient";
import type { ExtractedClue } from "@/lib/clueIntake";

type NoticeType = "success" | "error" | "info";

interface ClueIntakePanelProps {
  onClues: (candidates: ExtractedClue[], sourceLabel: string) => void;
  onNotice: (notice: { type: NoticeType; message: string }) => void;
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

export default function ClueIntakePanel({ onClues, onNotice }: ClueIntakePanelProps) {
  const [input, setInput] = useState("");
  const [candidates, setCandidates] = useState<ExtractedClue[]>([]);
  const [sourceLabel, setSourceLabel] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);

  const handleExtract = async () => {
    const text = input.trim();
    if (!text) {
      onNotice({ type: "error", message: "请粘贴一条线索链接或原文" });
      return;
    }

    setIsExtracting(true);
    onNotice({ type: "info", message: "正在抓取并提炼线索" });
    try {
      const isUrl = URL_PATTERN.test(text);
      const result = await extractClues(isUrl ? { url: text } : { rawText: text });
      setCandidates(result.candidates);
      setSourceLabel(result.sourceType);
      onNotice({
        type: result.usedFallback ? "info" : "success",
        message: result.usedFallback
          ? `未配置 AI，已原样抓取 ${result.candidates.length} 条待提炼素材`
          : `已从${result.sourceType}提炼 ${result.candidates.length} 条素材候选，确认后加入素材库`,
      });
    } catch (error) {
      console.error("[ClueIntakePanel] 提炼失败", { action: "clues.extract", error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "线索提炼失败" });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAdd = () => {
    if (candidates.length === 0) return;
    // 成功提示由 dashboard 统一发（与手动新增素材对齐），面板只负责清空
    onClues(candidates, sourceLabel);
    setCandidates([]);
    setInput("");
    setSourceLabel("");
  };

  return (
    <details className="group border border-stone-300 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-stone-50">
        <div className="flex items-center gap-3">
          <span className="text-stone-400 transition-transform group-open:rotate-90">▸</span>
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-stone-400">Clue Intake</div>
            <div className="text-sm font-black text-stone-950">从 X / GitHub 线索采集</div>
          </div>
        </div>
        <span className="text-xs text-stone-500">粘贴链接联网抓取，或直接贴原文</span>
      </summary>

      <div className="border-t border-stone-200 p-4">
        <label className="block text-xs font-bold text-stone-500">线索链接或原文</label>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          placeholder="贴一条 X 帖子 / GitHub 仓库或 Issue 链接（自动联网抓取），或直接粘贴正文"
          className="mt-2 w-full resize-none border border-stone-300 bg-[#f8f6f1] px-3 py-2 text-sm font-semibold text-stone-900 outline-none focus:border-stone-950"
        />
        <p className="mt-2 text-xs leading-5 text-stone-500">
          GitHub 走公开 API 取仓库描述 + README / Issue 正文；X 与普通网页直接抓取，抓不全时改为粘贴原文。提炼为待提炼素材，进入素材库后参与生成选题。
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleExtract}
            disabled={isExtracting || !input.trim()}
            className="border border-stone-950 bg-white px-3 py-2 text-sm font-black text-stone-950 transition-colors hover:bg-stone-950 hover:text-white disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400"
          >
            {isExtracting ? "提炼中" : "提炼候选"}
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={candidates.length === 0}
            className="border border-rose-600 bg-rose-600 px-3 py-2 text-sm font-black text-white transition-colors hover:bg-stone-950 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
          >
            加入素材库（{candidates.length}）
          </button>
        </div>
      </div>

      {candidates.length > 0 && (
        <div className="border-t border-stone-200 p-4">
          <div className="text-xs font-bold text-stone-400">候选素材{sourceLabel && ` · 来源 ${sourceLabel}`}</div>
          <ul className="mt-2 space-y-2">
            {candidates.map((clue, index) => (
              <li key={`${clue.event}-${index}`} className="border border-stone-200 bg-[#f8f6f1] px-3 py-2">
                <div className="text-sm font-bold leading-6 text-stone-900">{clue.event}</div>
                <div className="mt-0.5 text-xs leading-5 text-stone-600">方法：{clue.method || "（待补）"}</div>
                {clue.pitfall && <div className="mt-0.5 text-xs leading-5 text-stone-500">痛点：{clue.pitfall}</div>}
                {clue.relatedTerm && <div className="mt-0.5 text-xs text-stone-400">术语：{clue.relatedTerm}</div>}
              </li>
            ))}
          </ul>
          <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
            候选还没入库。点「加入素材库」后会作为待提炼素材进入素材库，可再编辑。
          </div>
        </div>
      )}
    </details>
  );
}
