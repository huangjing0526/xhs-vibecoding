"use client";

import { useState } from "react";
import { MATERIAL_STATUS, type MaterialItem } from "@/lib/xhsWorkflow";
import EntityList, { type EntityColumn } from "./EntityList";
import LocalDocsSyncPanel from "./LocalDocsSyncPanel";
import type { Notice } from "./types";

function clip(text: string | undefined, maxLength = 92): string {
  if (!text) return "未填写";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
interface SourceWorkspaceProps {
  materials: MaterialItem[];
  selectedMaterialIds: string[];
  localDocsSourceDir: string;
  isFeishuReady: boolean;
  onToggleMaterial: (materialId: string) => void;
  onSelectPendingMaterials: () => void;
  onClearSelectedMaterials: () => void;
  onAdd: () => void;
  onEditMaterial: (item: MaterialItem) => void;
  onDeleteMaterial: (materialId: string) => void;
  onBatchDeleteMaterials: (materialIds: string[]) => void;
  onNotice: (notice: Notice) => void;
  onImported: () => Promise<void>;
}

type MaterialViewFilter = "all" | "pending" | "processed";

export default function SourceWorkspace({
  materials,
  selectedMaterialIds,
  localDocsSourceDir,
  isFeishuReady,
  onToggleMaterial,
  onSelectPendingMaterials,
  onClearSelectedMaterials,
  onAdd,
  onEditMaterial,
  onDeleteMaterial,
  onBatchDeleteMaterials,
  onNotice,
  onImported,
}: SourceWorkspaceProps) {
  const [materialFilter, setMaterialFilter] = useState<MaterialViewFilter>("all");
  const pendingMaterials = materials.filter((item) => item.status === MATERIAL_STATUS.pending);
  const processedMaterials = materials.filter((item) => item.status !== MATERIAL_STATUS.pending);
  const visibleMaterials =
    materialFilter === "pending"
      ? pendingMaterials
      : materialFilter === "processed"
        ? processedMaterials
        : materials;

  const materialColumns: EntityColumn<MaterialItem>[] = [
    {
      key: "source",
      label: "来源",
      width: "140px",
      render: (item) => (
        <div className="min-w-0">
          <div className="text-xs font-bold text-stone-400">{item.sourceId}</div>
          <div className="mt-1.5 inline-flex bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
            {item.status || "素材"}
          </div>
        </div>
      ),
    },
    {
      key: "event",
      label: "核心事件",
      render: (item) => (
        <div className="text-sm font-black leading-6 text-stone-950">{clip(item.event || item.summary, 82)}</div>
      ),
    },
    {
      key: "method",
      label: "可复用方法",
      render: (item) => (
        <div className="text-sm font-semibold leading-6 text-stone-600">{clip(item.method || item.pitfall, 92)}</div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <LocalDocsSyncPanel
        defaultSourceDir={localDocsSourceDir}
        isFeishuReady={isFeishuReady}
        onNotice={onNotice}
        onImported={onImported}
      />

      <EntityList
        items={visibleMaterials}
        getRowId={(item) => item.recordId}
        columns={materialColumns}
        selectedIds={selectedMaterialIds}
        onToggleRow={onToggleMaterial}
        onRowClick={(item) => onToggleMaterial(item.recordId)}
        filters={[
          { id: "all", label: "全部", count: materials.length },
          { id: "pending", label: "待提炼", count: pendingMaterials.length },
          { id: "processed", label: "已处理", count: processedMaterials.length },
        ]}
        activeFilter={materialFilter}
        onFilterChange={(id) => setMaterialFilter(id as MaterialViewFilter)}
        onEdit={onEditMaterial}
        onDelete={(item) => onDeleteMaterial(item.recordId)}
        deleteConfirm={(item) => {
          const label = clip(item.event || item.summary, 40);
          return isFeishuReady
            ? `确定永久删除这条素材吗？\n「${label}」\n会从飞书素材表彻底删除，不可恢复。`
            : `确定移除这条素材吗？\n「${label}」`;
        }}
        onBatchDelete={onBatchDeleteMaterials}
        batchDeleteConfirm={(count) =>
          isFeishuReady
            ? `确定永久删除选中的 ${count} 条素材吗？会从飞书素材表彻底删除，不可恢复。`
            : `确定移除选中的 ${count} 条素材吗？`
        }
        emptyText="当前筛选下暂无素材"
        onAdd={onAdd}
        addLabel="+ 新增素材"
        toolbarExtra={
          <>
            <button
              type="button"
              onClick={onSelectPendingMaterials}
              disabled={pendingMaterials.length === 0}
              className="border border-stone-300 bg-white px-3 py-1.5 text-sm font-black text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-300"
            >
              选前 6 条
            </button>
            <button
              type="button"
              onClick={onClearSelectedMaterials}
              disabled={selectedMaterialIds.length === 0}
              className="border border-stone-300 bg-white px-3 py-1.5 text-sm font-black text-stone-600 transition-colors hover:border-rose-600 hover:text-rose-600 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-300"
            >
              清空
            </button>
          </>
        }
      />
    </div>
  );
}

