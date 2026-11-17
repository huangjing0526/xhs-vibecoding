"use client";

import { useCallback } from "react";
import { Download, RotateCcw } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import type { Notice } from "@/components/workflow/types";
import { useContentImagePreview } from "@/components/workflow/useContentImagePreview";
import { downloadImageAsset } from "@/lib/imageWorkflow";
import { aspectPx, aspectRatioCss } from "@/lib/targets";
import type { TemplateDefinition, TemplateRunResult } from "@/lib/templates/types";

export default function TemplateResult({
  template,
  result,
  onRegenerate,
  onNotice,
  running,
}: {
  template: TemplateDefinition;
  result: TemplateRunResult;
  onRegenerate: () => void;
  onNotice: (notice: Notice) => void;
  running: boolean;
}) {
  const handleError = useCallback((message: string) => onNotice({ type: "error", message }), [onNotice]);

  // canvas 引擎只给结构化 plan，出图在浏览器完成——见 lib/templates/types.ts 的 TemplateOutput
  const { canvasRef, dataUrl } = useContentImagePreview({
    plan: result.output.plan,
    px: aspectPx(template.aspect),
    onError: handleError,
  });

  return (
    <Card>
      <CardHeader
        title={template.name}
        description={result.usedFallback ? "未配置 AI，这是规则兜底的结果" : `由 ${result.provider} 生成`}
        action={
          <div className="flex items-center gap-2">
            {result.usedFallback && <Badge tone="warn">兜底</Badge>}
            <Button size="sm" loading={running} icon={<RotateCcw size={13} />} onClick={onRegenerate}>
              重新生成
            </Button>
          </div>
        }
      />

      <canvas ref={canvasRef} className="hidden" />

      <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border border-line bg-soft">
        {dataUrl ? (
          // 产物是 dataUrl，尺寸由模板 aspect 决定，交给 next/image 没有收益
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt={`${template.name}预览`} className="block w-full" />
        ) : (
          <div style={{ aspectRatio: aspectRatioCss(template.aspect) }}>
            <Skeleton className="h-full w-full" />
          </div>
        )}
      </div>

      <Button
        variant="primary"
        block
        className="mt-3"
        disabled={!dataUrl}
        icon={<Download size={14} />}
        onClick={() => downloadImageAsset(dataUrl, `${template.name}-${Date.now()}.png`)}
      >
        下载图片
      </Button>
    </Card>
  );
}
