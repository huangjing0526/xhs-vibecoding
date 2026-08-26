import Image from "next/image";
import TemplateThumb from "@/components/workflow/TemplateThumb";
import type { ImageFactoryTemplate } from "@/lib/imageFactory";

/**
 * 模板缩略图：有真实样例就放样例，没有就退回内联示意图。
 * 产出类型条、首页、模板目录三处都要这一条规则，写三遍必然漂移，所以只写一次。
 * 需由带 `relative` 的定尺容器包住——图片用 fill 铺满它。
 */
export default function TemplatePreview({
  template,
  sizes,
  active = false,
}: {
  template: Pick<ImageFactoryTemplate, "preview" | "thumb">;
  /** 交给 next/image 的取图宽度，按各处卡片实际宽度给。 */
  sizes: string;
  active?: boolean;
}) {
  if (template.preview) {
    return <Image src={template.preview} alt="" fill sizes={sizes} className="object-cover" unoptimized />;
  }
  return <TemplateThumb thumb={template.thumb} active={active} />;
}
