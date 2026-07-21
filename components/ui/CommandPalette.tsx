"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CornerDownLeft, Search } from "lucide-react";

export interface Command {
  id: string;
  label: string;
  /** 右侧补充说明，如所属分区或笔记状态 */
  hint?: string;
  group: string;
  icon?: ReactNode;
  /** 额外的搜索词，让「封面」也能搜到「图片」 */
  keywords?: string;
  run: () => void;
}

/** 命中即得分：完全匹配 > 前缀 > 包含；返回 -1 表示不匹配。 */
function score(command: Command, query: string): number {
  if (!query) return 0;
  const haystack = `${command.label} ${command.hint || ""} ${command.keywords || ""}`.toLowerCase();
  const label = command.label.toLowerCase();
  if (label === query) return 3;
  if (label.startsWith(query)) return 2;
  return haystack.includes(query) ? 1 : -1;
}

/**
 * ⌘K 命令面板：跳转分区、跳到某篇笔记、执行动作，全部一个入口。
 * 快捷键在组件内注册，挂一次即可。
 */
export default function CommandPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return commands
      .map((command) => ({ command, rank: score(command, normalized) }))
      .filter((item) => item.rank >= 0)
      .sort((a, b) => b.rank - a.rank)
      .map((item) => item.command);
  }, [commands, query]);

  // 分组渲染，但键盘导航走扁平序号：先算好 id → 序号，渲染时只查表
  const indexById = useMemo(() => new Map(visible.map((command, index) => [command.id, index])), [visible]);

  const groups = useMemo(() => {
    const map = new Map<string, Command[]>();
    visible.forEach((command) => {
      const list = map.get(command.group) || [];
      list.push(command);
      map.set(command.group, list);
    });
    return [...map.entries()];
  }, [visible]);

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery("");
    setActiveIndex(0);
  }, [onOpenChange]);

  const runAt = useCallback(
    (index: number) => {
      const command = visible[index];
      if (!command) return;
      close();
      command.run();
    },
    [close, visible]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 选中项滚进视野，键盘翻到列表底部时不会跑丢
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (visible.length ? (current + 1) % visible.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (visible.length ? (current - 1 + visible.length) % visible.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runAt(activeIndex);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-surface shadow-pop"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜分区、笔记，或直接执行动作"
            // 面板打开时这是唯一可聚焦项，光标本身已说明焦点，再套一圈焦点框反而喧宾夺主
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint focus-visible:outline-none"
          />
          <kbd className="shrink-0 rounded-lg bg-soft px-1.5 py-0.5 font-mono text-[11px] font-bold text-faint">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-auto p-2">
          {visible.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-faint">没有匹配的命令</p>
          ) : (
            groups.map(([group, items]) => (
              <div key={group} className="mb-2 last:mb-0">
                <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
                  {group}
                </div>
                {items.map((command) => {
                  const index = indexById.get(command.id) ?? 0;
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      data-active={isActive}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => runAt(index)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${
                        isActive ? "bg-brand-50 text-brand-700" : "text-ink hover:bg-soft"
                      }`}
                    >
                      {command.icon && (
                        <span className={`shrink-0 ${isActive ? "text-brand-500" : "text-faint"}`}>
                          {command.icon}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{command.label}</span>
                      {command.hint && <span className="shrink-0 text-xs text-faint">{command.hint}</span>}
                      {isActive && <CornerDownLeft size={13} className="shrink-0 text-brand-400" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
