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

export default function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  compact = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg border border-[#D2D2D7] bg-[#F5F5F7] p-1"
    >
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={`min-w-0 rounded-md px-3 text-left text-sm font-semibold transition-colors ${
              compact ? "py-1.5" : "py-2"
            } ${
              isActive
                ? "bg-white text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "text-[#6E6E73] hover:text-[#1D1D1F]"
            }`}
          >
            <span className="block truncate">{option.label}</span>
            {option.description && !compact && (
              <span className="mt-0.5 block truncate text-xs font-medium text-[#A1A1A6]">
                {option.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
