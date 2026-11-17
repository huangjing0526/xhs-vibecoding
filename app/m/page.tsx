"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Clapperboard, Image as ImageIcon, RefreshCw, Video } from "lucide-react";
import VibeNoteLogo from "@/components/VibeNoteLogo";
import Badge from "@/components/ui/Badge";
import { CardRail, SectionHeader } from "@/components/mobile/MobileSection";
import ToolIcon from "@/components/mobile/ToolIcon";
import { useWorkflowData } from "@/components/mobile/useWorkflowData";
import { rememberTopic } from "@/lib/mobile/selection";
import { MOBILE_TOOLS, type MobileTool } from "@/lib/mobile/tools";
import { switchToDesktop } from "@/lib/mobile/viewMode";
import { listTemplates } from "@/lib/workflowClient";
import type { TemplateDefinition } from "@/lib/templates/types";
import { isPublishedDraft } from "@/lib/xhsWorkflow";

/** 桌面专属能力：说清为什么点不动，并给一条切过去的路，而不是灰着不响应。 */
function noticeDesktopOnly(tool: MobileTool) {
  toast.info(`「${tool.label}」建议在桌面端使用`, {
    description: tool.hint,
    action: { label: "切桌面版", onClick: switchToDesktop },
  });
}

function ToolTile({ tool }: { tool: MobileTool }) {
  const available = Boolean(tool.href);

  const inner = (
    <>
      <span
        className={`relative flex h-12 w-12 items-center justify-center rounded-2xl ${
          available ? "bg-soft text-ink" : "bg-soft/60 text-faint"
        }`}
      >
        <ToolIcon tool={tool} />
        {tool.featured && (
          <span className="absolute -right-2 -top-1 rounded-full bg-brand-500 px-1.5 text-[9px] font-bold leading-4 text-white">
            推荐
          </span>
        )}
      </span>
      <span className={`text-[11px] font-bold leading-tight ${available ? "text-ink" : "text-faint"}`}>
        {tool.label}
      </span>
    </>
  );

  if (!available) {
    return (
      <button type="button" onClick={() => noticeDesktopOnly(tool)} className="flex flex-col items-center gap-1.5">
        {inner}
      </button>
    );
  }

  return (
    <Link href={tool.href as string} className="flex flex-col items-center gap-1.5">
      {inner}
    </Link>
  );
}

function FeatureCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col justify-between gap-6 rounded-3xl border border-line bg-surface p-4 shadow-card"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-brand">
        {icon}
      </span>
      <span>
        <span className="block text-[15px] font-bold leading-tight text-ink">{title}</span>
        <span className="mt-1 block text-[11px] font-medium leading-4 text-faint">{description}</span>
      </span>
    </Link>
  );
}

export default function MobileHome() {
  const router = useRouter();
  const { mode, config, snapshot, loading, reload } = useWorkflowData();
  const [templates, setTemplates] = useState<TemplateDefinition[]>([]);

  useEffect(() => {
    let cancelled = false;

    listTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data.packs.flatMap((pack) => pack.templates));
      })
      .catch((error) => {
        // 模板只是首页的一个分区，拉不到就少一块，不该弹窗打断浏览
        console.error("[MobileHome] 模板列表加载失败", { action: "mobile.template.list", error });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const published = snapshot.drafts.filter(isPublishedDraft);

  const openNote = (topicId: string) => {
    rememberTopic(topicId);
    router.push("/m/works");
  };

  return (
    <div className="space-y-7 px-3 pt-3">
      <header className="flex items-center gap-2">
        <VibeNoteLogo size={26} />
        <span className="font-rounded text-[17px] font-bold leading-none tracking-tight text-ink">VibeNote</span>

        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-bold text-muted disabled:text-faint"
        >
          <RefreshCw size={12} strokeWidth={2.4} className={loading ? "animate-spin" : ""} />
          {mode === "connected" ? "同步飞书" : "Demo 数据"}
        </button>
      </header>

      <Link
        href="/m/t/extract"
        className="block overflow-hidden rounded-3xl bg-brand-gradient p-5 text-white shadow-brand"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">AI 视频 · 图文</p>
        <h1 className="mt-2 text-[26px] font-bold leading-[1.2]">
          一条链接
          <br />
          拆出爆款脚本
        </h1>
        <p className="mt-2 text-[12px] font-medium leading-5 text-white/80">
          抖音 / 小红书链接 → 无水印视频 + 口播文案 + 结构拆解
        </p>
        <span className="mt-4 inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-brand-600">
          立即拆片
          <ArrowRight size={14} strokeWidth={2.6} />
        </span>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <FeatureCard
          href="/m/t/clip"
          icon={<Clapperboard size={20} strokeWidth={1.9} />}
          title="一键出片"
          description="数字人口播 · 产品展示"
        />
        <FeatureCard
          href="/m/t/cover"
          icon={<ImageIcon size={20} strokeWidth={1.9} />}
          title="封面配图"
          description="封面 · 内容图直接出"
        />
      </div>

      <div className="grid grid-cols-4 gap-x-2 gap-y-5 rounded-3xl border border-line bg-surface p-4 shadow-card">
        {MOBILE_TOOLS.map((tool) => (
          <ToolTile key={tool.id} tool={tool} />
        ))}
      </div>

      <section>
        <SectionHeader title="我的作品" count={published.length} href="/m/works" />

        {published.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-line bg-surface px-4 py-8 text-center shadow-card">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-soft text-faint">
              <Video size={24} strokeWidth={1.6} />
            </span>
            <p className="text-[12px] font-medium text-faint">已发布的笔记会出现在这里，先去创作吧~</p>
            <Link
              href="/m/t/video"
              className="rounded-xl bg-ink px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-black"
            >
              创作视频
            </Link>
          </div>
        ) : (
          <CardRail>
            {published.slice(0, 8).map((draft) => (
              <button
                key={draft.noteId}
                type="button"
                onClick={() => openNote(draft.topicId)}
                className="flex w-[168px] shrink-0 snap-start flex-col justify-between gap-3 rounded-3xl border border-line bg-surface p-3.5 text-left shadow-card"
              >
                <p className="line-clamp-2 text-[13px] font-bold leading-snug text-ink">{draft.title}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-medium text-faint">{draft.target || "小红书"}</span>
                  <Badge tone="ok">已发</Badge>
                </div>
              </button>
            ))}
          </CardRail>
        )}
      </section>

      <section>
        <SectionHeader title="模板库" count={templates.length} href="/m/create" />

        {templates.length === 0 ? (
          <div className="skeleton h-[92px] rounded-3xl" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {templates.slice(0, 6).map((template) => (
              <Link
                key={template.id}
                href="/m/create"
                className="rounded-2xl border border-line bg-surface p-3.5 shadow-card"
              >
                <p className="truncate text-[13px] font-bold leading-tight text-ink">{template.name}</p>
                <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-4 text-faint">
                  {template.description}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <p className="pb-2 text-center text-[10px] font-medium text-faint">
        {mode === "connected" ? "已连接飞书" : "本地体验模式"}
        {config?.aiProvider ? ` · AI ${config.aiProvider}` : ""}
      </p>
    </div>
  );
}
