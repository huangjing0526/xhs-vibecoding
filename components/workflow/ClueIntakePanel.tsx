"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import IntakeShell from "@/components/workflow/IntakeShell";
import { Field, Textarea } from "@/components/ui/Field";
import { extractClues } from "@/lib/workflowClient";
import type { ExtractedClue } from "@/lib/clueIntake";
import type { Notice } from "./types";

interface ClueIntakePanelProps {
  onClues: (candidates: ExtractedClue[], sourceLabel: string) => void;
  onNotice: (notice: Notice) => void;
  headless?: boolean;
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

export default function ClueIntakePanel({ onClues, onNotice, headless }: ClueIntakePanelProps) {
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
    <IntakeShell title="从 X / GitHub 线索采集" hint="粘贴链接联网抓取，或直接贴原文" headless={headless}>
      <div className="p-5">
        <Field
          label="线索链接或原文"
          hint="GitHub 走公开 API 取仓库描述 + README / Issue 正文；X 与普通网页直接抓取，抓不全时改为粘贴原文。提炼结果进素材库后参与生成选题。"
        >
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={3}
            placeholder="贴一条 X 帖子 / GitHub 仓库或 Issue 链接（自动联网抓取），或直接粘贴正文"
          />
        </Field>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={handleExtract} loading={isExtracting} disabled={!input.trim()}>
            {isExtracting ? "提炼中" : "提炼候选"}
          </Button>
          <Button variant="primary" onClick={handleAdd} disabled={candidates.length === 0}>
            加入素材库（{candidates.length}）
          </Button>
        </div>
      </div>

      {candidates.length > 0 && (
        <div className="border-t border-line bg-soft p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
            候选素材{sourceLabel && ` · 来源 ${sourceLabel}`}
          </div>
          <ul className="mt-2.5 space-y-2">
            {candidates.map((clue, index) => (
              <li key={`${clue.event}-${index}`} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <div className="text-sm font-bold leading-6 text-ink">{clue.event}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted">方法：{clue.method || "（待补）"}</div>
                {clue.pitfall && <div className="mt-0.5 text-xs leading-5 text-muted">痛点：{clue.pitfall}</div>}
                {clue.relatedTerm && <div className="mt-0.5 text-xs text-faint">术语：{clue.relatedTerm}</div>}
              </li>
            ))}
          </ul>
          <Callout tone="warn" className="mt-3">
            候选还没入库。点「加入素材库」后会作为待提炼素材进入素材库，可再编辑。
          </Callout>
        </div>
      )}
    </IntakeShell>
  );
}
