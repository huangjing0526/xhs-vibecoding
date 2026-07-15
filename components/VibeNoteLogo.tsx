interface VibeNoteLogoProps {
  size?: number;
}

export default function VibeNoteLogo({ size = 40 }: VibeNoteLogoProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label="VibeNote"
    >
      <rect x="2" y="2" width="44" height="44" rx="8" fill="#FFFFFF" />
      <circle cx="24" cy="24" r="14.5" fill="none" stroke="#111111" strokeWidth="3" />
      <circle cx="24" cy="24" r="8.5" fill="none" stroke="#111111" strokeWidth="3" />
      <circle cx="24" cy="24" r="3" fill="#111111" />
      <path d="M33 15L39 9" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round" />
      <path d="M9 39L15 33" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
