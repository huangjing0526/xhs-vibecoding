"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** 一列定义：可选固定列宽（CSS width，如 "120px"；省略=自适应剩余空间）。 */
export interface EntityColumn<T> {
  key: string;
  label: string;
  /** 固定列宽，如 "92px"；省略则自适应。 */
  width?: string;
  render: (item: T) => ReactNode;
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

  /** 行操作。 */
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  deleteConfirm?: (item: T) => string | null;

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
  /** 工具条右上「+ 新增」按钮：传入即渲染。 */
  onAdd?: () => void;
  addLabel?: string;
}

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
      className="h-4 w-4 cursor-pointer accent-rose-600 disabled:cursor-not-allowed"
    />
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
  onEdit,
  onDelete,
  deleteConfirm,
  onBatchDelete,
  batchDeleteConfirm,
  isArchived,
  archivedLabel,
  emptyText = "暂无数据",
  maxHeightClass = "max-h-[calc(100vh-240px)] min-h-[420px]",
  toolbarExtra,
  onAdd,
  addLabel = "+ 新增",
}: EntityListProps<T>) {
  const [showArchived, setShowArchived] = useState(false);
  const hasActions = Boolean(onEdit || onDelete);
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

  const handleDeleteClick = (item: T) => {
    const message = deleteConfirm?.(item);
    if (message && !window.confirm(message)) return;
    onDelete?.(item);
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
        className={`border-b border-stone-100 transition-colors ${
          onRowClick && !archived ? "cursor-pointer" : ""
        } ${
          archived
            ? "bg-stone-50 text-stone-400"
            : isActive
              ? "bg-rose-50"
              : isSelected
                ? "bg-rose-50/50"
                : "hover:bg-stone-50"
        }`}
      >
        <td className="w-10 px-3 py-3 align-top" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            disabled={!selectable}
            onChange={() => selectable && onToggleRow(id)}
            aria-label={isSelected ? "取消勾选" : "勾选"}
            className="h-4 w-4 cursor-pointer accent-rose-600 disabled:cursor-not-allowed"
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
            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
              {!archived && onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="border border-stone-200 bg-white px-2 py-1 text-xs font-bold text-stone-500 transition-colors hover:border-stone-950 hover:text-stone-950"
                >
                  编辑
                </button>
              )}
              {!archived && onDelete && (
                <button
                  type="button"
                  onClick={() => handleDeleteClick(item)}
                  className="border border-stone-200 bg-white px-2 py-1 text-xs font-bold text-stone-400 transition-colors hover:border-rose-600 hover:text-rose-600"
                >
                  删除
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
    );
  };

  return (
    <section className="border border-stone-200 bg-white">
      {(filters || onBatchDelete || toolbarExtra || onAdd) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-3 py-2.5">
          {filters?.map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onFilterChange?.(tab.id)}
                className={`px-3 py-1.5 text-sm font-black transition-colors ${
                  isActive ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-xs font-bold tabular-nums text-stone-400">{tab.count}</span>
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            {toolbarExtra}
            <span className="text-xs text-stone-400">
              已选 <span className="font-black tabular-nums text-stone-700">{selectedCount}</span>
            </span>
            {onBatchDelete && (
              <button
                type="button"
                onClick={handleBatchDelete}
                disabled={selectedCount === 0}
                className="border border-stone-300 bg-white px-3 py-1.5 text-sm font-black text-stone-600 transition-colors hover:border-rose-600 hover:text-rose-600 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-300"
              >
                批量删除
              </button>
            )}
            {onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className="bg-stone-950 px-3 py-1.5 text-sm font-black text-white transition-colors hover:bg-stone-800"
              >
                {addLabel}
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`overflow-auto ${maxHeightClass}`}>
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-stone-50">
            <tr className="border-b border-stone-200 text-xs font-black uppercase tracking-wider text-stone-400">
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
                <tr className="border-y border-stone-200 bg-stone-100">
                  <td colSpan={colCount} className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setShowArchived((value) => !value)}
                      className="flex items-center gap-2 text-xs font-black text-stone-500 hover:text-stone-800"
                    >
                      <span className={`transition-transform ${showArchived ? "rotate-90" : ""}`}>▸</span>
                      <span>{archivedLabel?.(archivedItems.length) ?? `已归档 ${archivedItems.length} 条`}</span>
                    </button>
                  </td>
                </tr>
                {showArchived && archivedItems.map((item) => renderRow(item, true))}
              </>
            )}

            {items.length === 0 && (
              <tr>
                <td colSpan={colCount} className="p-10 text-center text-sm text-stone-500">
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
