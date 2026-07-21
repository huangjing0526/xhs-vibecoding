"use client";

import Button from "@/components/ui/Button";

/** 次级描边按钮：列表/检查面板里的「编辑 / 去某处 / 修复」入口，全局统一样式。 */
export default function LinkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="secondary" onClick={onClick}>
      {label}
    </Button>
  );
}
