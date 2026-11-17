"use client";

import Link from "next/link";
import { Clapperboard, Image as ImageIcon, Scissors } from "lucide-react";
import MobileTabHeader from "@/components/mobile/MobileTabHeader";
import { showNotice } from "@/components/mobile/notice";
import TemplateStudio from "@/components/workflow/TemplateStudio";

const QUICK_ENTRIES = [
  { href: "/m/t/extract", label: "链接拆片", icon: Scissors },
  { href: "/m/t/video", label: "视频脚本", icon: Clapperboard },
  { href: "/m/t/cover", label: "封面配图", icon: ImageIcon },
];

/** 创作 tab：模板直达是主体，上面挂三个高频能力的快捷入口。 */
export default function MobileCreatePage() {
  return (
    <div>
      <MobileTabHeader title="创作" subtitle="选一个模板填参数，或直接用下面的能力开工" />

      <div className="grid grid-cols-3 gap-2.5 px-3">
        {QUICK_ENTRIES.map((entry) => {
          const Icon = entry.icon;
          return (
            <Link
              key={entry.href}
              href={entry.href}
              className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-2 py-3 shadow-card"
            >
              <Icon size={19} strokeWidth={1.9} className="text-brand-500" />
              <span className="text-[11px] font-bold text-ink">{entry.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="px-3 py-5">
        <TemplateStudio onNotice={showNotice} />
      </div>
    </div>
  );
}
