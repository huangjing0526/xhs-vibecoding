"use client";

import { useState, type FormEvent } from "react";
import { Sparkles, Undo2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { INLINE_REWRITE_LABEL, type InlineRewriteAction } from "@/lib/inlineRewrite";

const PRESETS: Array<Exclude<InlineRewriteAction, "custom">> = ["polish", "expand", "condense", "hook"];

interface InlineRewriteBarProps {
  /** 当前选中的字数，0 表示没有选区（此时只在可撤销时保留条） */
  selectionLength: number;
  running: boolean;
  /** 有可撤销的上一次改写 */
  canUndo: boolean;
  onRun: (action: InlineRewriteAction, instruction?: string) => void;
  onCancel: () => void;
  onUndo: () => void;
  onDismiss: () => void;
}

/**
 * 正文选区的改写条：吸附在编辑器底部操作条上方。
 * 位置固定而非跟随光标——textarea 里跟随光标要靠镜像元素测坐标，滚动和换行时极易错位。
 */
export default function InlineRewriteBar({
  selectionLength,
  running,
  canUndo,
  onRun,
  onCancel,
  onUndo,
  onDismiss,
}: InlineRewriteBarProps) {
  const [instruction, setInstruction] = useState("");
  const hasSelection = selectionLength > 0;

  const handleCustom = (event: FormEvent) => {
    event.preventDefault();
    if (!instruction.trim() || !hasSelection) return;
    onRun("custom", instruction.trim());
  };

  return (
    <div className="shrink-0 animate-fade-up border-t border-line bg-brand-50/70 px-5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-brand-600">
          <Sparkles size={14} />
          {hasSelection ? `已选 ${selectionLength} 字` : "改写完成"}
        </span>

        {hasSelection &&
          PRESETS.map((action) => (
            <Button
              key={action}
              size="sm"
              variant="secondary"
              onClick={() => onRun(action)}
              disabled={running}
            >
              {INLINE_REWRITE_LABEL[action]}
            </Button>
          ))}

        {hasSelection && (
          <form onSubmit={handleCustom} className="flex min-w-0 flex-1 items-center gap-2">
            <input
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="或直接说怎么改，回车执行"
              disabled={running}
              className="h-8 min-w-0 flex-1 rounded-xl border border-transparent bg-surface px-3 text-xs text-ink transition-colors placeholder:text-faint focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            />
            <Button type="submit" size="sm" variant="ai" loading={running} disabled={!instruction.trim()}>
              {running ? "改写中" : "改写"}
            </Button>
          </form>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {running && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              取消
            </Button>
          )}
          {canUndo && !running && (
            <Button size="sm" variant="ghost" onClick={onUndo} icon={<Undo2 size={13} />}>
              撤销改写
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDismiss} icon={<X size={13} />} aria-label="关闭改写条" />
        </div>
      </div>
    </div>
  );
}
