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
      aria-label="Jing AI Log"
    >
      <rect x="4" y="4" width="40" height="40" rx="8" fill="#f8f6f1" />
      <rect x="5.5" y="5.5" width="37" height="37" rx="6.5" fill="#ffffff" stroke="#1c1917" strokeWidth="3" />

      <path
        d="M15 14H30M27.5 14V29.5C27.5 34.2 24.3 37 19.8 37C16.8 37 14.4 35.8 13 33.7"
        fill="none"
        stroke="#1c1917"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M16 20H23M16 25H22M16 30H20"
        fill="none"
        stroke="#0f766e"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <path
        d="M33 18C36.8 20.1 38.1 25.4 35.2 29.1C34.2 30.4 33 31.3 31.5 31.9"
        fill="none"
        stroke="#e11d48"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M31.2 27.6L31.5 31.9L35.4 30.4" fill="none" stroke="#e11d48" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      <rect x="32" y="10" width="6" height="6" rx="1.5" fill="#f59e0b" />
      <circle cx="36.5" cy="36.5" r="2.5" fill="#0f766e" />
      <circle cx="11.5" cy="11.5" r="2.5" fill="#e11d48" />
    </svg>
  );
}
