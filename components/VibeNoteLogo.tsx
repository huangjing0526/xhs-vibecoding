interface VibeNoteLogoProps {
  size?: number;
}

/** 品牌标记：靛紫圆角方块 + 白色同心环，环外两道笔画取「记录」的意象。 */
export default function VibeNoteLogo({ size = 40 }: VibeNoteLogoProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label="VibeNote">
      <defs>
        <linearGradient id="vibenote-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="48" height="48" rx="14" fill="url(#vibenote-brand)" />
      <g fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round">
        <circle cx="24" cy="24" r="13" />
        <circle cx="24" cy="24" r="6.5" />
        <path d="M34 14L39.5 8.5" />
        <path d="M8.5 39.5L14 34" />
      </g>
      <circle cx="24" cy="24" r="2.4" fill="#FFFFFF" />
    </svg>
  );
}
