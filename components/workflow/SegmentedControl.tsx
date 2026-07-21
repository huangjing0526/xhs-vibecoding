interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  compact?: boolean;
}

/** 分段控件：全圆角凹槽 + 浮起的白色滑块，用于同层级的模式切换。 */
export default function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  compact = false,
}: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-2xl bg-soft p-1">
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={`min-w-0 rounded-xl px-3.5 text-left text-sm font-bold transition-all duration-150 ${
              compact ? "py-1.5" : "py-2"
            } ${isActive ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}
          >
            <span className="block truncate">{option.label}</span>
            {option.description && !compact && (
              <span className="mt-0.5 block truncate text-xs font-medium text-faint">{option.description}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
