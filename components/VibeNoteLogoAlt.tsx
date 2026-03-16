interface VibeNoteLogoAltProps {
  size?: number;
}

export default function VibeNoteLogoAlt({ size = 40 }: VibeNoteLogoAltProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size}>
      <defs>
        <linearGradient id="vibeGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff2442" />
          <stop offset="50%" stopColor="#ff4466" />
          <stop offset="100%" stopColor="#ff6b9d" />
        </linearGradient>

        <linearGradient id="vibeGradient3" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ff6b9d" />
          <stop offset="100%" stopColor="#ff2442" />
        </linearGradient>
      </defs>

      {/* 音频条形组成的 V 字 */}
      {/* 左侧 */}
      <rect x="6" y="14" width="3" height="8" rx="1.5" fill="url(#vibeGradient2)" opacity="0.6" />
      <rect x="10" y="10" width="3" height="16" rx="1.5" fill="url(#vibeGradient2)" opacity="0.7" />
      <rect x="14" y="6" width="3" height="24" rx="1.5" fill="url(#vibeGradient2)" opacity="0.8" />
      <rect x="18" y="8" width="3" height="20" rx="1.5" fill="url(#vibeGradient2)" opacity="0.9" />
      <rect x="22" y="12" width="3" height="12" rx="1.5" fill="url(#vibeGradient2)" />

      {/* 中心 V 点 */}
      <rect x="23" y="28" width="2" height="16" rx="1" fill="url(#vibeGradient3)" />

      {/* 右侧 */}
      <rect x="27" y="12" width="3" height="12" rx="1.5" fill="url(#vibeGradient2)" />
      <rect x="31" y="8" width="3" height="20" rx="1.5" fill="url(#vibeGradient2)" opacity="0.9" />
      <rect x="35" y="6" width="3" height="24" rx="1.5" fill="url(#vibeGradient2)" opacity="0.8" />
      <rect x="39" y="10" width="3" height="16" rx="1.5" fill="url(#vibeGradient2)" opacity="0.7" />
      <rect x="43" y="14" width="3" height="8" rx="1.5" fill="url(#vibeGradient2)" opacity="0.6" />

      {/* 底部装饰点 */}
      <circle cx="24" cy="42" r="2.5" fill="url(#vibeGradient2)" />
    </svg>
  );
}
