import type { ReactNode } from "react";

interface HeaderAction {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

interface ModuleHeaderProps {
  title: string;
  description: string;
  count?: number;
  countLabel?: string;
  primary?: HeaderAction;
  secondary?: HeaderAction[];
  meta?: ReactNode;
}

export default function ModuleHeader({
  title,
  description,
  count,
  countLabel,
  primary,
  secondary = [],
  meta,
}: ModuleHeaderProps) {
  return (
    <section className="rounded-lg border border-[#E5E5EA] bg-white/90 px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal text-[#1D1D1F]">{title}</h1>
            {typeof count === "number" && (
              <span className="rounded-md bg-[#F5F5F7] px-2 py-1 text-xs font-semibold text-[#6E6E73]">
                {count}
                {countLabel ? ` ${countLabel}` : ""}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6E6E73]">{description}</p>
          {meta && <div className="mt-3">{meta}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {secondary.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className="rounded-lg border border-[#D2D2D7] bg-white px-4 py-2 text-sm font-semibold text-[#1D1D1F] transition-colors hover:bg-[#F5F5F7] disabled:cursor-not-allowed disabled:text-[#A1A1A6]"
            >
              {action.label}
            </button>
          ))}
          {primary && (
            <button
              type="button"
              onClick={primary.onClick}
              disabled={primary.disabled}
              className="rounded-lg bg-[#FF2442] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(255,36,66,0.18)] transition-colors hover:bg-[#e61f3a] disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6] disabled:shadow-none"
            >
              {primary.label}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
