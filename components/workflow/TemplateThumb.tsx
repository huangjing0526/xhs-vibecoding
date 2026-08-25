import type { ImageTemplateThumb } from "@/lib/imageFactory";

interface TemplateThumbProps {
  thumb?: ImageTemplateThumb;
  active?: boolean;
}

interface ThumbPalette {
  bg: string;
  weak: string;
  mid: string;
  strong: string;
  edge: string;
  /** 带描边的白色画框，多个示意图共用 */
  frame: string;
}

const PALETTE: Record<"idle" | "active", ThumbPalette> = {
  idle: {
    bg: "fill-soft",
    weak: "fill-sunken",
    mid: "fill-line-strong",
    strong: "fill-faint",
    edge: "stroke-line-strong",
    frame: "fill-surface stroke-line-strong",
  },
  active: {
    bg: "fill-brand-50",
    weak: "fill-brand-100",
    mid: "fill-brand-200",
    strong: "fill-brand-400",
    edge: "stroke-brand-200",
    frame: "fill-surface stroke-brand-200",
  },
};

/**
 * 模板示意图：纯内联 SVG，不依赖任何图片资源。
 * 只表达「这个模板产出什么结构」，不追求写实——选中态整体换成品牌色调。
 */
export default function TemplateThumb({ thumb, active = false }: TemplateThumbProps) {
  const palette = PALETTE[active ? "active" : "idle"];

  return (
    <svg viewBox="0 0 120 90" className="h-full w-full" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <rect width="120" height="90" className={palette.bg} />
      {renderThumb(thumb, palette)}
    </svg>
  );
}

function renderThumb(thumb: ImageTemplateThumb | undefined, p: ThumbPalette) {
  switch (thumb) {
    // 纯白画布上的商品 + 底部三个视角缩略，点出「一次多张」
    case "white-bg":
      return (
        <>
          <rect x="16" y="10" width="88" height="50" rx="4" className={p.frame} strokeWidth="1" />
          <rect x="49" y="20" width="22" height="28" rx="3" className={p.mid} />
          <rect x="49" y="20" width="22" height="9" rx="3" className={p.strong} />
          <ellipse cx="60" cy="51" rx="16" ry="2.5" className={p.weak} />
          {[24, 50, 76].map((x) => (
            <g key={x}>
              <rect x={x} y="67" width="20" height="15" rx="2.5" className={p.frame} strokeWidth="1" />
              <rect x={x + 7} y="71" width="6" height="7" rx="1.5" className={p.mid} />
            </g>
          ))}
        </>
      );

    // 商品放进有地平线和氛围的生活场景
    case "product-scene":
      return (
        <>
          <rect x="0" y="0" width="120" height="56" className={p.weak} />
          <circle cx="94" cy="20" r="9" className={p.mid} />
          <path d="M0 56 H120 V90 H0 Z" className={p.mid} />
          <rect x="46" y="30" width="26" height="26" rx="3" className={p.strong} />
          <path d="M18 56 q6 -18 12 0 Z" className={p.strong} />
          <ellipse cx="59" cy="58" rx="19" ry="3" className={p.weak} />
        </>
      );

    // 干净背景上的单一主视觉，四周留白
    case "commerce-hero":
      return (
        <>
          <circle cx="60" cy="45" r="34" className={p.weak} />
          <rect x="46" y="24" width="28" height="38" rx="4" className={p.mid} />
          <rect x="46" y="24" width="28" height="12" rx="4" className={p.strong} />
          <ellipse cx="60" cy="66" rx="20" ry="3" className={p.weak} />
        </>
      );

    // 人物剪影 + 叠上去的服装轮廓
    case "model-tryon":
      return (
        <>
          <circle cx="44" cy="24" r="10" className={p.mid} />
          <path d="M30 78 q0 -30 14 -30 q14 0 14 30 Z" className={p.mid} />
          <path d="M74 30 l10 -6 l16 0 l10 6 l-6 10 l-4 -2 l0 28 l-16 0 l0 -28 l-4 2 Z" className={p.strong} />
          <path d="M36 48 q8 -4 16 0 l4 16 l-24 0 Z" className={p.strong} />
        </>
      );

    // 主体不变，右侧色卡代表被借鉴的视觉语言
    case "style-transfer":
      return (
        <>
          <rect x="12" y="18" width="44" height="54" rx="5" className={p.frame} strokeWidth="1" />
          <circle cx="34" cy="38" r="10" className={p.mid} />
          <path d="M18 66 q16 -18 32 0 Z" className={p.mid} />
          <rect x="64" y="18" width="44" height="54" rx="5" className={p.weak} />
          <rect x="70" y="25" width="32" height="12" rx="3" className={p.strong} />
          <rect x="70" y="41" width="32" height="9" rx="3" className={p.mid} />
          <rect x="70" y="54" width="20" height="9" rx="3" className={p.strong} />
        </>
      );

    // 左边平铺的衣服，右边穿到人身上，中间箭头点出「平铺 → 上身」
    case "flat-to-model":
      return (
        <>
          <path d="M14 26 l10 -6 l16 0 l10 6 l-6 10 l-4 -2 l0 28 l-16 0 l0 -28 l-4 2 Z" className={p.mid} />
          <path d="M56 45 h10 m-4 -4 l4 4 l-4 4" className={p.edge} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="92" cy="24" r="10" className={p.mid} />
          <path d="M78 78 q0 -30 14 -30 q14 0 14 30 Z" className={p.mid} />
          <path d="M84 48 q8 -4 16 0 l4 16 l-24 0 Z" className={p.strong} />
        </>
      );

    // 镜框里的人 + 举起的手机，点出「对镜自拍」
    case "mirror-selfie":
      return (
        <>
          <rect x="32" y="10" width="56" height="72" rx="8" className={p.frame} strokeWidth="1" />
          <circle cx="56" cy="32" r="9" className={p.mid} />
          <path d="M40 76 q0 -26 16 -26 q16 0 16 26 Z" className={p.mid} />
          <rect x="70" y="38" width="11" height="17" rx="2" className={p.strong} />
        </>
      );

    // 带雨棚的店面，橱窗与门之间站着人
    case "storefront":
      return (
        <>
          <path d="M12 30 L60 12 L108 30 Z" className={p.mid} />
          <rect x="20" y="30" width="80" height="50" rx="2" className={p.frame} strokeWidth="1" />
          <rect x="26" y="38" width="22" height="28" rx="2" className={p.weak} />
          <rect x="74" y="38" width="20" height="42" rx="2" className={p.weak} />
          <circle cx="60" cy="46" r="7" className={p.strong} />
          <path d="M51 80 q0 -22 9 -22 q9 0 9 22 Z" className={p.strong} />
        </>
      );

    // 地平线 + 树 + 太阳，人站在户外
    case "outdoor-street":
      return (
        <>
          <circle cx="98" cy="18" r="8" className={p.weak} />
          <path d="M0 62 H120 V90 H0 Z" className={p.weak} />
          <circle cx="26" cy="34" r="14" className={p.mid} />
          <rect x="24" y="46" width="4" height="16" className={p.mid} />
          <circle cx="70" cy="30" r="9" className={p.strong} />
          <path d="M56 78 q0 -30 14 -30 q14 0 14 30 Z" className={p.strong} />
        </>
      );

    // 左边挂着同款人像海报，右边是真人半身，点出「与自己的海报同框」
    case "portrait-studio":
      return (
        <>
          <rect x="14" y="14" width="40" height="58" rx="3" className={p.frame} strokeWidth="1" />
          <circle cx="34" cy="34" r="8" className={p.weak} />
          <path d="M22 66 q0 -20 12 -20 q12 0 12 20 Z" className={p.weak} />
          <circle cx="84" cy="34" r="12" className={p.mid} />
          <path d="M64 82 q0 -28 20 -28 q20 0 20 28 Z" className={p.strong} />
        </>
      );

    // 商品被放大镜圈出的局部，底下三个细节缩略
    case "detail-shots":
      return (
        <>
          <rect x="18" y="12" width="84" height="44" rx="4" className={p.frame} strokeWidth="1" />
          <path d="M26 56 q14 -30 28 -8 q10 14 22 8 Z" className={p.mid} />
          <circle cx="72" cy="30" r="13" className={p.frame} strokeWidth="2" />
          <path d="M81 39 l9 9" className={p.edge} strokeWidth="3" strokeLinecap="round" />
          {[24, 50, 76].map((x) => (
            <rect key={x} x={x} y="64" width="20" height="18" rx="2.5" className={p.weak} />
          ))}
        </>
      );

    // 中缝分开的左右两格，同一个主体、两种明暗
    case "compare-grid":
      return (
        <>
          <rect x="10" y="14" width="47" height="62" rx="4" className={p.weak} />
          <rect x="63" y="14" width="47" height="62" rx="4" className={p.frame} strokeWidth="1" />
          <rect x="24" y="30" width="19" height="30" rx="3" className={p.mid} />
          <rect x="77" y="30" width="19" height="30" rx="3" className={p.strong} />
          <path d="M60 10 V80" className={p.edge} strokeWidth="2" strokeLinecap="round" />
        </>
      );

    // 俯拍摆台：一个主体加两件陪衬小物
    case "note-flatlay":
      return (
        <>
          <rect x="10" y="10" width="100" height="70" rx="6" className={p.weak} />
          <rect x="44" y="26" width="32" height="38" rx="4" className={p.strong} />
          <circle cx="26" cy="30" r="8" className={p.mid} />
          <rect x="86" y="46" width="16" height="22" rx="3" className={p.mid} />
        </>
      );

    // 半身人物居中，背景是虚化的空间
    case "talking-head":
      return (
        <>
          <rect x="8" y="8" width="104" height="74" rx="6" className={p.weak} />
          <rect x="16" y="20" width="20" height="40" rx="2" className={p.mid} />
          <circle cx="60" cy="34" r="13" className={p.mid} />
          <path d="M36 82 q0 -26 24 -26 q24 0 24 26 Z" className={p.strong} />
        </>
      );

    // 一张留白的主视觉 + 两块可叠字的底图
    case "brand-kit":
      return (
        <>
          <rect x="10" y="12" width="52" height="66" rx="5" className={p.frame} strokeWidth="1" />
          <path d="M16 78 q14 -26 26 -10 q8 10 14 10 Z" className={p.mid} />
          <circle cx="48" cy="28" r="7" className={p.strong} />
          <rect x="70" y="12" width="40" height="30" rx="4" className={p.weak} />
          <rect x="70" y="48" width="40" height="30" rx="4" className={p.mid} />
        </>
      );

    // 自建模板兜底：一张通用图片占位
    default:
      return (
        <>
          <rect x="24" y="20" width="72" height="50" rx="5" className={p.frame} strokeWidth="1" />
          <circle cx="43" cy="36" r="6" className={p.strong} />
          <path d="M28 66 l20 -22 l16 18 l10 -10 l18 14 Z" className={p.mid} />
        </>
      );
  }
}
