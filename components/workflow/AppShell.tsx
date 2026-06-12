"use client";

import type { ReactNode } from "react";
import VibeNoteLogo from "@/components/VibeNoteLogo";
import ContentContextPanel from "./ContentContextPanel";
import ModuleSidebar from "./ModuleSidebar";
import type { BloggerDistillation } from "@/lib/bloggerWorkflow";
import type { ContentCard, DraftNote } from "@/lib/xhsWorkflow";
import type { WorkflowMode } from "@/lib/workflowClient";
import type { WorkflowModule } from "./workflowModules";

interface AppShellProps {
  activeModule: WorkflowModule;
  moduleCounts: Partial<Record<WorkflowModule, number>>;
  workflowMode: WorkflowMode;
  aiProvider?: string | null;
  syncing: boolean;
  syncLabel: string;
  onSync: () => void;
  onModuleChange: (module: WorkflowModule) => void;
  context: {
    bloggerDistillation: BloggerDistillation | null;
    selectedMaterialsCount: number;
    selectedTopic: ContentCard | null;
    selectedDraft: DraftNote | null;
    coverReady: boolean;
    contentImageReady: boolean;
    videoReady: boolean;
    reviewSummary?: string;
    primaryLabel: string;
    primaryDisabled: boolean;
    onPrimaryAction: () => void;
  };
  children: ReactNode;
  onboarding?: ReactNode;
}

export default function AppShell({
  activeModule,
  moduleCounts,
  workflowMode,
  aiProvider,
  syncing,
  syncLabel,
  onSync,
  onModuleChange,
  context,
  children,
  onboarding,
}: AppShellProps) {
  const isConnected = workflowMode === "connected";

  return (
    <main className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F]">
      <header className="sticky top-0 z-30 border-b border-[#E5E5EA] bg-[#F5F5F7]/85 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center">
            <VibeNoteLogo size={40} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-[#1D1D1F]">内容创作 Studio</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs font-medium text-[#6E6E73]">
              <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-[#0A7F64]" : "bg-[#A1A1A6]"}`} />
              <span>{isConnected ? "Connected · 飞书已连接" : "Demo · 本地体验"}</span>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded-md bg-[#1D1D1F] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white">
              {isConnected ? "Workflow Ready" : "Demo Ready"}
            </span>
            {aiProvider && (
              <span className="rounded-md border border-[#D2D2D7] bg-white px-2 py-1 text-[11px] font-semibold text-[#6E6E73]">
                AI: {aiProvider}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="rounded-lg border border-[#D2D2D7] bg-white px-4 py-2 text-sm font-semibold text-[#1D1D1F] transition-colors hover:bg-[#F5F5F7] disabled:cursor-not-allowed disabled:text-[#A1A1A6]"
          >
            {syncing ? "同步中..." : syncLabel}
          </button>
        </div>
      </header>

      {onboarding && <div className="px-4 pt-4">{onboarding}</div>}

      <div className="grid min-h-[calc(100vh-64px)] md:grid-cols-[216px_minmax(0,1fr)] xl:grid-cols-[216px_minmax(0,1fr)_320px]">
        <div className="md:sticky md:top-16 md:h-[calc(100vh-64px)]">
          <ModuleSidebar
            activeModule={activeModule}
            counts={moduleCounts}
            onModuleChange={onModuleChange}
          />
        </div>

        <section className="min-w-0 space-y-4 px-4 py-4">
          {children}
        </section>

        <div className="hidden xl:sticky xl:top-16 xl:block xl:h-[calc(100vh-64px)]">
          <ContentContextPanel
            activeModule={activeModule}
            bloggerDistillation={context.bloggerDistillation}
            selectedMaterialsCount={context.selectedMaterialsCount}
            selectedTopic={context.selectedTopic}
            selectedDraft={context.selectedDraft}
            coverReady={context.coverReady}
            contentImageReady={context.contentImageReady}
            videoReady={context.videoReady}
            reviewSummary={context.reviewSummary}
            primaryLabel={context.primaryLabel}
            primaryDisabled={context.primaryDisabled}
            onPrimaryAction={context.onPrimaryAction}
            onOpenModule={onModuleChange}
          />
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E5EA] bg-[#FBFBFD]/95 p-3 backdrop-blur-xl xl:hidden">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              onClick={context.onPrimaryAction}
              disabled={context.primaryDisabled}
              className="rounded-lg bg-[#FF2442] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6]"
            >
              {context.primaryLabel}
            </button>
            <button
              type="button"
              onClick={() => onModuleChange("assets")}
              className="rounded-lg border border-[#D2D2D7] bg-white px-4 py-2.5 text-sm font-semibold text-[#1D1D1F]"
            >
              内容包
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
