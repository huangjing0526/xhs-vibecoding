"use client";

/** 次级描边按钮：列表/检查面板里的「编辑 / 去某处 / 修复」入口，全局统一样式。 */
export default function LinkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-md border border-[#D2D2D7] bg-white px-2.5 py-1 text-xs font-semibold text-[#1D1D1F] transition-colors hover:border-[#1D1D1F]"
    >
      {label}
    </button>
  );
}
