"use client";

import { ChevronRight, Monitor, RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";
import MobileTabHeader from "@/components/mobile/MobileTabHeader";
import ToolIcon from "@/components/mobile/ToolIcon";
import { useWorkflowData } from "@/components/mobile/useWorkflowData";
import { DESKTOP_ONLY_TOOLS } from "@/lib/mobile/tools";
import { switchToDesktop } from "@/lib/mobile/viewMode";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="shrink-0 text-[12px] font-bold text-muted">{label}</span>
      <span className="min-w-0 truncate text-[12px] font-medium text-faint">{value}</span>
    </div>
  );
}

/** 我的：数据源状态、桌面专属能力的去处、视图切换。 */
export default function MobileMePage() {
  const { mode, config, snapshot, loading, reload } = useWorkflowData();
  const connected = mode === "connected";
  const missing = config?.missingFeishuConfig ?? [];

  return (
    <div>
      <MobileTabHeader title="我的" subtitle="数据源与视图设置" />

      <div className="space-y-4 px-3">
        <section className="rounded-3xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-ok" : "bg-faint"}`} />
            <span className="text-[14px] font-bold text-ink">{connected ? "已连接飞书" : "本地体验模式"}</span>
          </div>

          <div className="mt-2 divide-y divide-line">
            <Row label="AI 服务" value={config?.aiProvider ? `${config.aiProvider}${config.aiReady ? "" : "（未配置密钥）"}` : "未知"} />
            <Row label="素材 / 选题" value={`${snapshot.materials.length} 条素材 · ${snapshot.topics.length} 条选题`} />
            {!connected && missing.length > 0 && <Row label="飞书缺配置" value={missing.join("、")} />}
          </div>

          <Button
            block
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={reload}
            loading={loading}
            icon={<RefreshCw size={13} strokeWidth={2.4} />}
          >
            {loading ? "同步中" : connected ? "同步飞书数据" : "重新连接"}
          </Button>
        </section>

        <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
          <h2 className="border-b border-line px-4 py-3 text-[13px] font-bold text-ink">桌面端能力</h2>
          <p className="px-4 pt-3 text-[11px] font-medium leading-5 text-faint">
            这些能力要么依赖多栏表格，要么依赖本机服务，手机上做不了完整操作，留在桌面工作台。
          </p>

          <div className="divide-y divide-line px-4 pb-1 pt-2">
            {DESKTOP_ONLY_TOOLS.map((tool) => (
              <div key={tool.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-soft text-faint">
                  <ToolIcon tool={tool} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold leading-tight text-ink">{tool.label}</p>
                  <p className="mt-0.5 truncate text-[11px] font-medium text-faint">{tool.hint}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <button
          type="button"
          onClick={switchToDesktop}
          className="flex w-full items-center gap-3 rounded-3xl border border-line bg-surface p-4 text-left shadow-card"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
            <Monitor size={17} strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold leading-tight text-ink">切换到桌面版</span>
            <span className="mt-0.5 block text-[11px] font-medium text-faint">完整工作台，之后手机访问不再自动跳转</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-faint" />
        </button>
      </div>
    </div>
  );
}
