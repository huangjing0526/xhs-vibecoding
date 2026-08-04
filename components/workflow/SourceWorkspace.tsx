"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import ModalOverlay from "@/components/ui/ModalOverlay";
import { MATERIAL_STATUS, type MaterialItem } from "@/lib/xhsWorkflow";
import EntityList, { type EntityColumn, type RowAction } from "./EntityList";
import type { Notice } from "./types";

function clip(text: string | undefined, maxLength = 92): string {
  if (!text) return "未填写";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
interface SourceWorkspaceProps {
  materials: MaterialItem[];
  selectedMaterialIds: string[];
  isFeishuReady: boolean;
  onToggleMaterial: (materialId: string) => void;
  onSelectPendingMaterials: () => void;
  onClearSelectedMaterials: () => void;
  onAdd: () => void;
  onEditMaterial: (item: MaterialItem) => void;
  onDeleteMaterial: (materialId: string) => void;
  onBatchDeleteMaterials: (materialIds: string[]) => void;
  /** 单条提炼成选题（仅待提炼素材可用）。 */
  onExtractMaterial: (item: MaterialItem) => void;
  /** 在 待提炼 / 已提炼 间切换状态。 */
  onToggleMaterialStatus: (item: MaterialItem) => void;
  onNotice: (notice: Notice) => void;
}

type MaterialViewFilter = "all" | "pending" | "processed";

export default function SourceWorkspace({
  materials,
  selectedMaterialIds,
  isFeishuReady,
  onToggleMaterial,
  onSelectPendingMaterials,
  onClearSelectedMaterials,
  onAdd,
  onEditMaterial,
  onDeleteMaterial,
  onBatchDeleteMaterials,
  onExtractMaterial,
  onToggleMaterialStatus,
  onNotice,
}: SourceWorkspaceProps) {
  const [materialFilter, setMaterialFilter] = useState<MaterialViewFilter>("all");
  const [viewingMaterial, setViewingMaterial] = useState<MaterialItem | null>(null);

  const handleCopyMethod = (item: MaterialItem) => {
    const text = (item.method || item.pitfall || "").trim();
    if (!text) {
      onNotice({ type: "error", message: "这条素材没有可复制的方法" });
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => onNotice({ type: "success", message: "已复制可复用方法" }),
      () => onNotice({ type: "error", message: "复制失败，请手动选择文本" })
    );
  };
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
        rowActions={(item) => {
          const isPending = item.status === MATERIAL_STATUS.pending;
          const actions: RowAction<MaterialItem>[] = [
            { key: "edit", label: "编辑", onClick: onEditMaterial },
            {
              key: "delete",
              label: "删除",
              variant: "danger",
              onClick: () => onDeleteMaterial(item.recordId),
              confirm: () => {
                const label = clip(item.event || item.summary, 40);
                return isFeishuReady
                  ? `确定永久删除这条素材吗？\n「${label}」\n会从飞书素材表彻底删除，不可恢复。`
                  : `确定移除这条素材吗？\n「${label}」`;
              },
            },
            { key: "view", label: "查看详情", inMenu: true, onClick: setViewingMaterial },
            { key: "copy", label: "复制方法", inMenu: true, onClick: handleCopyMethod },
            {
              key: "status",
              label: isPending ? "标记已处理" : "标记待提炼",
              inMenu: true,
              onClick: onToggleMaterialStatus,
            },
          ];
          if (isPending) {
            actions.unshift({ key: "extract", label: "提炼选题", variant: "ai", onClick: onExtractMaterial });
          }
          return actions;
        }}
        onClearSelection={onClearSelectedMaterials}
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
          <Button
            size="sm"
            variant="secondary"
            onClick={onSelectPendingMaterials}
            disabled={pendingMaterials.length === 0}
          >
            选前 6 条
          </Button>
        }
      />

      {viewingMaterial && (
        <MaterialDetailModal material={viewingMaterial} onClose={() => setViewingMaterial(null)} />
      )}
    </div>
  );
}

const DETAIL_FIELDS: { label: string; key: keyof MaterialItem }[] = [
  { label: "来源", key: "sourceId" },
  { label: "来源类型", key: "sourceType" },
  { label: "日期", key: "date" },
  { label: "状态", key: "status" },
  { label: "核心事件", key: "event" },
  { label: "可复用方法", key: "method" },
  { label: "踩坑 / 痛点", key: "pitfall" },
  { label: "相关术语", key: "relatedTerm" },
];

/** 只读素材详情：全字段不截断。遮罩样式与 ManualEntryForm 保持一致。 */
function MaterialDetailModal({
  material,
  onClose,
}: {
  material: MaterialItem;
  onClose: () => void;
}) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-ink">素材详情</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
        <dl className="space-y-3">
          {DETAIL_FIELDS.map((field) => (
            <div key={field.key}>
              <dt className="text-xs font-bold text-faint">{field.label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-ink">
                {(material[field.key] || "").toString().trim() || "未填写"}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </ModalOverlay>
  );
}

