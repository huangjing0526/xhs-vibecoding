"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import Button, { type ButtonVariant } from "@/components/ui/Button";

/** 一列定义：可选固定列宽（CSS width，如 "120px"；省略=自适应剩余空间）。 */
export interface EntityColumn<T> {
  key: string;
  label: string;
  /** 固定列宽，如 "92px"；省略则自适应。 */
  width?: string;
  render: (item: T) => ReactNode;
}

/**
 * 一个行操作。inMenu=false（默认）直接渲染成按钮；inMenu=true 收进行尾「⋯ 更多」下拉。
 * 需要按行变文案/隐藏时，在 rowActions(item) 里按条目算好再返回。
 */
export interface RowAction<T> {
  key: string;
  label: string;
  onClick: (item: T) => void;
  variant?: ButtonVariant;
  inMenu?: boolean;
  /** 返回非空串则先 window.confirm 该文案，取消则不执行。 */
  confirm?: (item: T) => string | null;
}

export interface EntityFilterTab {
  id: string;
  label: string;
  count: number;
}

interface EntityListProps<T> {
  items: T[];
  getRowId: (item: T) => string;
  columns: EntityColumn<T>[];

  /** 多选集合（批量操作 + 行勾选）。 */
  selectedIds: string[];
  onToggleRow: (id: string) => void;
  /** 行是否可勾选，默认全部可选。 */
  isSelectable?: (item: T) => boolean;

  /** 当前指针：高亮某行（驱动下游精修/详情）。点行触发 onRowClick。 */
  activeId?: string | null;
  onRowClick?: (item: T) => void;

  /** 顶部筛选标签页（可选）。 */
  filters?: EntityFilterTab[];
  activeFilter?: string;
  onFilterChange?: (id: string) => void;

  /** 行操作：按条目返回操作列表；返回空数组则该行无操作列。 */
  rowActions?: (item: T) => RowAction<T>[];

  /** 清空选择（选中态浮条的「清空」）。 */
  onClearSelection?: () => void;
  /** 批量删除（作用于 selectedIds）。 */
  onBatchDelete?: (ids: string[]) => void;
  batchDeleteConfirm?: (count: number) => string | null;

  /** 归档分组（仅素材用）：命中的条目折叠在底部、不可选、无操作。 */
  isArchived?: (item: T) => boolean;
  archivedLabel?: (count: number) => string;

  emptyText?: string;
  maxHeightClass?: string;
  /** 工具条右侧额外内容（如素材的「选前 6 条」「清空」）。 */
  toolbarExtra?: ReactNode;
  /** 工具条右上「新增」按钮：传入即渲染。 */
  onAdd?: () => void;
  addLabel?: string;
}

const CHECKBOX_CLASS =
  "h-4 w-4 cursor-pointer rounded accent-brand-500 disabled:cursor-not-allowed disabled:opacity-40";

/** 表头主复选框：支持「全选 / 半选(indeterminate) / 未选」三态。 */
function HeaderCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={checked ? "取消全选" : "全选"}
      className={CHECKBOX_CLASS}
    />
  );
}

/** 行操作单元格：直接按钮 + 「⋯ 更多」下拉（inMenu 的收进来，点外部关闭）。 */
function RowActionsCell<T>({
  actions,
  onRun,
}: {
  actions: RowAction<T>[];
  onRun: (action: RowAction<T>) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const inlineActions = actions.filter((action) => !action.inMenu);
  const menuActions = actions.filter((action) => action.inMenu);

  return (
    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
      {inlineActions.map((action) => (
        <Button
          key={action.key}
          size="sm"
          variant={action.variant ?? "secondary"}
          onClick={() => onRun(action)}
        >
          {action.label}
        </Button>
      ))}
      {menuActions.length > 0 && (
        <div ref={ref} className="relative">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="更多操作"
            icon={<MoreHorizontal size={16} />}
          />
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 min-w-32 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-card">
              {menuActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRun(action);
                  }}
                  className={`block w-full px-3 py-2 text-left text-xs font-bold transition-colors hover:bg-soft ${
                    action.variant === "danger" ? "text-red-600" : "text-ink"
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EntityList<T>({
  items,
  getRowId,
  columns,
  selectedIds,
  onToggleRow,
  isSelectable,
  activeId,
  onRowClick,
  filters,
  activeFilter,
  onFilterChange,
  rowActions,
  onClearSelection,
  onBatchDelete,
  batchDeleteConfirm,
  isArchived,
  archivedLabel,
  emptyText = "暂无数据",
  maxHeightClass = "max-h-[calc(100vh-240px)] min-h-[420px]",
  toolbarExtra,
  onAdd,
  addLabel = "新增",
}: EntityListProps<T>) {
  const [showArchived, setShowArchived] = useState(false);
  const hasActions = Boolean(rowActions);
  const colCount = 1 + columns.length + (hasActions ? 1 : 0);

  const activeItems = items.filter((item) => !isArchived?.(item));
  const archivedItems = isArchived ? items.filter((item) => isArchived(item)) : [];

  const selectableIds = activeItems.filter((item) => isSelectable?.(item) ?? true).map(getRowId);
  const selectedSet = new Set(selectedIds);
  const selectedCount = selectableIds.filter((id) => selectedSet.has(id)).length;
  const allSelected = selectableIds.length > 0 && selectedCount === selectableIds.length;

  const handleToggleAll = () => {
    if (allSelected) selectableIds.forEach((id) => selectedSet.has(id) && onToggleRow(id));
    else selectableIds.forEach((id) => !selectedSet.has(id) && onToggleRow(id));
  };

  const runRowAction = (item: T, action: RowAction<T>) => {
    const message = action.confirm?.(item);
    if (message && !window.confirm(message)) return;
    action.onClick(item);
  };

  const handleBatchDelete = () => {
    if (selectedCount === 0) return;
    const message = batchDeleteConfirm?.(selectedCount);
    if (message && !window.confirm(message)) return;
    onBatchDelete?.(selectableIds.filter((id) => selectedSet.has(id)));
  };

  const renderRow = (item: T, archived: boolean) => {
    const id = getRowId(item);
    const selectable = !archived && (isSelectable?.(item) ?? true);
    const isSelected = selectedSet.has(id);
    const isActive = activeId != null && activeId === id;

    return (
      <tr
        key={id}
        onClick={() => !archived && onRowClick?.(item)}
        className={`border-b border-line transition-colors ${onRowClick && !archived ? "cursor-pointer" : ""} ${
          archived
            ? "bg-soft text-faint"
            : isActive
              ? "bg-brand-50"
              : isSelected
                ? "bg-brand-50/60"
                : "hover:bg-soft"
        }`}
      >
        <td className="w-10 px-3 py-3 align-top" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            disabled={!selectable}
            onChange={() => selectable && onToggleRow(id)}
            aria-label={isSelected ? "取消勾选" : "勾选"}
            className={CHECKBOX_CLASS}
          />
        </td>
        {columns.map((column) => (
          <td
            key={column.key}
            style={column.width ? { width: column.width } : undefined}
            className="px-3 py-3 align-top"
          >
            {column.render(item)}
          </td>
        ))}
        {hasActions && (
          <td className="px-3 py-3 align-top" onClick={(event) => event.stopPropagation()}>
            {!archived && rowActions && (
              <RowActionsCell
                actions={rowActions(item)}
                onRun={(action) => runRowAction(item, action)}
              />
            )}
          </td>
        )}
      </tr>
    );
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      {/* 第一层：视图筛选（左） + 全局动作（右）。常驻，与选择无关。 */}
      {(filters || toolbarExtra || onAdd) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          {filters?.map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onFilterChange?.(tab.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  isActive ? "bg-ink text-white" : "bg-soft text-muted hover:bg-sunken"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 font-rounded tabular-nums opacity-70">{tab.count}</span>
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            {toolbarExtra}
            {onAdd && (
              <Button size="sm" variant="primary" onClick={onAdd} icon={<Plus size={14} strokeWidth={2.6} />}>
                {addLabel}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 第二层：选中态浮条。仅在有选中时出现，收纳批量动作。 */}
      {onBatchDelete && selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-brand-50/60 px-4 py-2.5">
          <span className="text-xs text-muted">
            已选 <span className="font-rounded font-bold tabular-nums text-ink">{selectedCount}</span> 条
          </span>
          {onClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              className="text-xs font-bold text-muted transition-colors hover:text-ink"
            >
              清空
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="danger" onClick={handleBatchDelete}>
              批量删除
            </Button>
          </div>
        </div>
      )}

      <div className={`overflow-auto ${maxHeightClass}`}>
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-soft">
            <tr className="border-b border-line text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
              <th className="w-10 px-3 py-2.5">
                <HeaderCheckbox
                  checked={allSelected}
                  indeterminate={selectedCount > 0}
                  disabled={selectableIds.length === 0}
                  onChange={handleToggleAll}
                />
              </th>
              {columns.map((column) => (
                <th key={column.key} style={column.width ? { width: column.width } : undefined} className="px-3 py-2.5">
                  {column.label}
                </th>
              ))}
              {hasActions && <th className="px-3 py-2.5 text-right">操作</th>}
            </tr>
          </thead>
          <tbody>
            {activeItems.map((item) => renderRow(item, false))}

            {archivedItems.length > 0 && (
              <>
                <tr className="border-y border-line bg-soft">
                  <td colSpan={colCount} className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setShowArchived((value) => !value)}
                      className="flex items-center gap-1.5 rounded-lg text-xs font-bold text-muted transition-colors hover:text-ink"
                    >
                      <ChevronRight
                        size={14}
                        className={`transition-transform ${showArchived ? "rotate-90" : ""}`}
                      />
                      <span>{archivedLabel?.(archivedItems.length) ?? `已归档 ${archivedItems.length} 条`}</span>
                    </button>
                  </td>
                </tr>
                {showArchived && archivedItems.map((item) => renderRow(item, true))}
              </>
            )}

            {items.length === 0 && (
              <tr>
                <td colSpan={colCount} className="p-12 text-center text-sm text-faint">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
