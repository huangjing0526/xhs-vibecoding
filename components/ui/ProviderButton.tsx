"use client";

import { Check } from "lucide-react";

/**
 * 一张引擎卡片：名字 + 可用状态 + 一句原因。
 *
 * 图片线和视频线的引擎 id 联合不同，但「可不可用、选没选中」的判断和样式完全一样，
 * 所以按公共形状收成泛型的一份——两份的时候选中态和禁用态的视觉规则已经开始各改各的了。
 *
 * 不可用的卡片不隐藏、只置灰并把原因摆在下面：藏起来的话，人不知道该去装什么、登什么。
 */
export interface ProviderLike<T extends string> {
  id: T;
  name: string;
  available: boolean;
  authenticated: boolean;
  message: string;
}

export default function ProviderButton<T extends string>({
  provider,
  selected,
  onSelect,
}: {
  provider: ProviderLike<T>;
  selected: boolean;
  onSelect: (id: T) => void;
}) {
  const enabled = provider.available && provider.authenticated;
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={() => onSelect(provider.id)}
      aria-pressed={selected}
      className={`rounded-2xl border p-3 text-left transition-all ${
        selected ? "border-brand-400 bg-brand-50 ring-2 ring-brand-100" : "border-line bg-surface"
      } ${enabled ? "hover:border-brand-300" : "cursor-not-allowed opacity-55"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink">{provider.name}</span>
        {enabled && <Check size={14} className="text-ok" />}
      </div>
      <p className="mt-1 text-[11px] leading-4 text-faint">{provider.message}</p>
    </button>
  );
}
