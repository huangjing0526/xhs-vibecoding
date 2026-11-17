"use client";

interface ChipOption<T extends string> {
  id: T;
  label: string;
}

/**
 * 一排可横滑的圆角胶囊。
 *
 * 用在「选项比分段控件多、又不值得做成下拉」的地方：音色、清晰度、配图模板。
 * 与 SegmentedControl 的分工：那个是同层级的模式互斥切换（两三项、要有滑块感），
 * 这个是从一串同类里挑一个。
 */
export default function ChipRow<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<ChipOption<T>>;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex gap-2">
        {options.map((option) => {
          const active = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors ${
                active ? "bg-ink text-white" : "bg-soft text-muted"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
