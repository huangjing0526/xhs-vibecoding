interface VibeNoteLogoProps {
  size?: number;
}

export default function VibeNoteLogo({ size = 40 }: VibeNoteLogoProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size}>
      <defs>
        {/* 主渐变 - 小红书红到粉 */}
        <linearGradient id="mainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff2442" />
          <stop offset="100%" stopColor="#ff6b9d" />
        </linearGradient>

        {/* 星光渐变 */}
        <linearGradient id="sparkGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffd700" />
          <stop offset="100%" stopColor="#ff6b9d" />
        </linearGradient>

        {/* 柔和阴影 */}
        <filter id="shadow">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#ff2442" floodOpacity="0.25"/>
        </filter>
      </defs>

      {/* 笔记本主体 - 圆角矩形 */}
      <rect
        x="10"
        y="14"
        width="28"
        height="28"
        rx="6"
        fill="url(#mainGradient)"
        filter="url(#shadow)"
      />

      {/* 笔记横线 - 象征文字内容 */}
      <line x1="15" y1="22" x2="28" y2="22" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="15" y1="27" x2="31" y2="27" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="15" y1="32" x2="25" y2="32" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />

      {/* 爆款星芒 - 右上角迸发 */}
      <g transform="translate(30, 12)">
        {/* 主星 */}
        <circle cx="0" cy="0" r="5" fill="url(#sparkGradient)" opacity="0.9" />
        <circle cx="0" cy="0" r="3" fill="#fff" />

        {/* 四向光芒 */}
        <path d="M 0 -7 L 0 -10" stroke="#ffd700" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
        <path d="M 0 7 L 0 10" stroke="#ffd700" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <path d="M -7 0 L -10 0" stroke="#ffd700" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <path d="M 7 0 L 10 0" stroke="#ffd700" strokeWidth="2" strokeLinecap="round" opacity="0.8" />

        {/* 对角光芒 */}
        <path d="M -5 -5 L -7 -7" stroke="#ff6b9d" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <path d="M 5 5 L 7 7" stroke="#ff6b9d" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <path d="M 5 -5 L 7 -7" stroke="#ff6b9d" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      </g>

      {/* 小火花 - 增强爆款感 */}
      <circle cx="38" cy="20" r="2" fill="#ffd700" opacity="0.4" />
      <circle cx="35" cy="8" r="1.5" fill="#ff6b9d" opacity="0.5" />
    </svg>
  );
}
