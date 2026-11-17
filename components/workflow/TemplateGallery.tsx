"use client";

import { ArrowRight } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { TemplateDefinition, TemplateOutputKind, TemplatePack } from "@/lib/templates/types";

/** 产出类型的角标文案。产出「是什么」由模板配置声明，这里只负责翻译成中文。 */
const OUTPUT_KIND_LABEL: Record<TemplateOutputKind, string> = {
  image: "出图",
  video: "出视频",
  script: "出脚本",
};

function TemplateCard({ template, onSelect }: { template: TemplateDefinition; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className="group text-left">
      <Card interactive className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="min-w-0 text-sm font-bold leading-tight text-ink">{template.name}</h4>
          <Badge tone="brand">{OUTPUT_KIND_LABEL[template.outputKind]}</Badge>
        </div>

        <p className="mt-1.5 flex-1 text-xs leading-5 text-faint">{template.description}</p>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
          <span className="min-w-0 truncate text-[11px] font-medium text-faint">{template.previewTone}</span>
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-brand-500">
            {template.aspect}
            <ArrowRight size={12} className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </span>
        </div>
      </Card>
    </button>
  );
}

/** 模板画廊：按包分栏。包的顺序与包内模板顺序都由注册表决定，这里不重排。 */
export default function TemplateGallery({
  packs,
  onSelect,
}: {
  packs: TemplatePack[];
  onSelect: (template: TemplateDefinition) => void;
}) {
  return (
    <div className="space-y-7">
      {packs.map((pack) => (
        <section key={pack.id}>
          <div className="mb-3">
            <h3 className="text-[15px] font-bold leading-tight text-ink">{pack.name}</h3>
            <p className="mt-1 text-xs leading-5 text-faint">{pack.description}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pack.templates.map((template) => (
              <TemplateCard key={template.id} template={template} onSelect={() => onSelect(template)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
