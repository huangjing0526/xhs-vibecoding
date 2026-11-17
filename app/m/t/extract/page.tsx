"use client";

import { useState } from "react";
import { toast } from "sonner";
import MobileToolPage from "@/components/mobile/MobileToolPage";
import { showNotice } from "@/components/mobile/notice";
import VideoExtractPanel from "@/components/workflow/VideoExtractPanel";
import { saveDaokuTemplate } from "@/lib/workflowClient";
import type { BloggerDistillation } from "@/lib/bloggerWorkflow";

/**
 * 链接拆片：手机上最顺手的入口——刷到一条爆款，复制分享口令直接粘进来。
 *
 * 面板整块复用桌面端的，抓取、转写、拆结构、沉淀道库都在里面；这里只补两件外壳的事：
 * 提示出口和「沉淀之后去哪看」。对标拆解本身留在桌面端，所以不跳转，只说清位置。
 */
export default function MobileExtractPage() {
  const [sunkDistillation, setSunkDistillation] = useState<BloggerDistillation | null>(null);

  return (
    <MobileToolPage title="链接拆片" subtitle="抖音 / 小红书链接 → 视频 + 口播稿 + 结构">
      {sunkDistillation && (
        <div className="mb-3 rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-card">
          <p className="text-[12px] font-bold text-ink">已沉淀到对标库</p>
          <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-4 text-faint">
            {sunkDistillation.coreDao || "核心道已写入，可在桌面端「对标拆解」里继续用它改写。"}
          </p>
        </div>
      )}

      <VideoExtractPanel
        onNotice={showNotice}
        onSinkToDaoku={async (distillation) => {
          await saveDaokuTemplate(distillation);
          setSunkDistillation(distillation);
        }}
        onGoBlogger={() => toast.info("道库已保存，去桌面端「对标拆解」可查看和改写")}
      />
    </MobileToolPage>
  );
}
