"use client";

interface BatchActionBarProps {
  count: number;
  onArchive: () => void;
  onCancel: () => void;
  itemLabel?: string;
}

export default function BatchActionBar({ count, onArchive, onCancel, itemLabel = "项" }: BatchActionBarProps) {
  if (count <= 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 transform">
      <div className="flex items-center gap-3 border border-stone-950 bg-stone-950 px-4 py-2.5 text-white shadow-2xl">
        <span className="text-sm font-black">
          已选 <span className="tabular-nums">{count}</span> {itemLabel}
        </span>
        <div className="h-5 w-px bg-stone-700" />
        <button
          type="button"
          onClick={onArchive}
          className="border border-rose-500 bg-rose-600 px-3 py-1.5 text-xs font-black text-white transition-colors hover:bg-rose-700"
        >
          批量归档
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-black text-stone-300 transition-colors hover:text-white"
        >
          取消
        </button>
      </div>
    </div>
  );
}
