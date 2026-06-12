interface WorkspaceHeaderProps {
  stageLabel: string;
  subtitle?: string;
  count?: number;
  countLabel?: string;
  syncing: boolean;
  syncLabel: string;
  onSync: () => void;
  primary: {
    label: string;
    disabled: boolean;
    onClick: () => void;
  };
}

export default function WorkspaceHeader({
  stageLabel,
  subtitle,
  count,
  countLabel,
  syncing,
  syncLabel,
  onSync,
  primary,
}: WorkspaceHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-stone-950 bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-stone-400">{stageLabel}</span>
          {typeof count === "number" && (
            <span className="text-xs text-stone-400 tabular-nums">
              {count}{countLabel ? ` ${countLabel}` : ""}
            </span>
          )}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="inline-flex items-center justify-center border-2 border-stone-950 bg-white px-5 py-2.5 text-sm font-black text-stone-950 transition-colors hover:bg-stone-950 hover:text-white disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400"
        >
          {syncing ? "同步中…" : syncLabel}
        </button>
        <button
          type="button"
          onClick={primary.onClick}
          disabled={primary.disabled}
          className="inline-flex items-center justify-center border-2 border-rose-600 bg-rose-600 px-6 py-2.5 text-sm font-black text-white transition-colors hover:bg-rose-700 hover:border-rose-700 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
        >
          {primary.label} →
        </button>
      </div>
    </div>
  );
}
