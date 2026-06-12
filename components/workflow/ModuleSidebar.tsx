import { WORKFLOW_MODULES, type WorkflowModule } from "./workflowModules";

interface ModuleSidebarProps {
  activeModule: WorkflowModule;
  counts: Partial<Record<WorkflowModule, number>>;
  onModuleChange: (module: WorkflowModule) => void;
}

export default function ModuleSidebar({
  activeModule,
  counts,
  onModuleChange,
}: ModuleSidebarProps) {
  return (
    <aside className="h-full border-r border-[#E5E5EA] bg-[#F5F5F7]/80 px-3 py-4">
      <div className="mb-4 px-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A1A1A6]">
          Workflow
        </div>
        <h2 className="mt-1 text-base font-semibold text-[#1D1D1F]">内容生产台</h2>
      </div>

      <button
        type="button"
        onClick={() => onModuleChange("overview")}
        className={`mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-all ${
          activeModule === "overview"
            ? "bg-white text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.06)]"
            : "text-[#6E6E73] hover:bg-white/70 hover:text-[#1D1D1F]"
        }`}
      >
        <span className={`text-[11px] font-semibold tabular-nums ${activeModule === "overview" ? "text-[#FF2442]" : "text-[#A1A1A6]"}`}>
          00
        </span>
        <span className="text-sm font-semibold">流水线总览</span>
      </button>

      <nav className="flex gap-2 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
        {WORKFLOW_MODULES.map((module) => {
          const isActive = activeModule === module.id;
          return (
            <button
              key={module.id}
              type="button"
              onClick={() => onModuleChange(module.id)}
              className={`relative grid min-w-[128px] grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-all md:w-full md:min-w-0 ${
                isActive
                  ? "bg-white text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.06)]"
                  : "text-[#6E6E73] hover:bg-white/70 hover:text-[#1D1D1F]"
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-2 h-[calc(100%-16px)] w-[3px] rounded-r-full bg-[#FF2442]" />
              )}
              <span className={`text-[11px] font-semibold tabular-nums ${isActive ? "text-[#FF2442]" : "text-[#A1A1A6]"}`}>
                {module.order}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{module.label}</span>
                <span className="mt-0.5 hidden truncate text-xs font-medium text-[#A1A1A6] lg:block">
                  {module.shortLabel}
                </span>
              </span>
              {typeof counts[module.id] === "number" && (
                <span className={`text-sm font-semibold tabular-nums ${isActive ? "text-[#1D1D1F]" : "text-[#A1A1A6]"}`}>
                  {counts[module.id]}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
