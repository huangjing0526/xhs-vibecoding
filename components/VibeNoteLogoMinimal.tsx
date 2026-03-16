interface VibeNoteLogoMinimalProps {
  size?: number;
}

export default function VibeNoteLogoMinimal({ size = 40 }: VibeNoteLogoMinimalProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size}>
      <defs>
        <linearGradient id="vibeGradient4" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff2442" />
          <stop offset="100%" stopColor="#ff6b9d" />
        </linearGradient>

        {/* 柔和阴影 */}
        <filter id="softShadow">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#ff2442" floodOpacity="0.3"/>
        </filter>
      </defs>

      {/* V 和 N 的创意组合 */}
      {/* V 形状 - 用圆角三角形 */}
      <path
        d="M 24 8
           L 40 32
           L 32 32
           L 24 18
           L 16 32
           L 8 32
           Z"
        fill="url(#vibeGradient4)"
        filter="url(#softShadow)"
      />

      {/* N 的一笔 - 融入 V 的底部 */}
      <rect
        x="18"
        y="28"
        width="4"
        height="16"
        rx="2"
        fill="url(#vibeGradient4)"
        opacity="0.8"
      />
      <rect
        x="26"
        y="28"
        width="4"
        height="16"
        rx="2"
        fill="url(#vibeGradient4)"
        opacity="0.8"
      />

      {/* 律动装饰元素 */}
      <circle cx="12" cy="14" r="2" fill="#ff6b9d" opacity="0.4" />
      <circle cx="36" cy="14" r="2" fill="#ff6b9d" opacity="0.4" />
      <circle cx="24" cy="42" r="2.5" fill="#ff2442" />
    </svg>
  );
}
