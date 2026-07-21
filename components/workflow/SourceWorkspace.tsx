"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
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
          <div className="text-xs font-bold text-faint">{item.sourceId}</div>
          <Badge className="mt-1.5">{item.status || "素材"}</Badge>
        </div>
      ),
    },
    {
      key: "event",
      label: "核心事件",
      render: (item) => (
        <div className="text-sm font-bold leading-6 text-ink">{clip(item.event || item.summary, 82)}</div>
      ),
    },
    {
      key: "method",
      label: "可复用方法",
      render: (item) => (
        <div className="text-sm leading-6 text-muted">{clip(item.method || item.pitfall, 92)}</div>
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
        addLabel="新增素材"
        toolbarExtra={
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={onSelectPendingMaterials}
              disabled={pendingMaterials.length === 0}
            >
              选前 6 条
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClearSelectedMaterials}
              disabled={selectedMaterialIds.length === 0}
            >
              清空
            </Button>
          </>
        }
      />
    </div>
  );
}

