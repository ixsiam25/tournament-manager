export function Crest({ size = 28 }: { size?: number }) {
  const height = Math.round((size * 36) / 32);
  return (
    <svg width={size} height={height} viewBox="0 0 32 36" aria-hidden>
      <path
        d="M16 1.5 L29 5.5 V17 C29 25.5 23.5 32 16 34.5 C8.5 32 3 25.5 3 17 V5.5 Z"
        fill="var(--pitch)"
        stroke="var(--line-strong)"
        strokeWidth="1.5"
      />
      <path d="M16 1.5 L29 5.5 V17 C29 25.5 23.5 32 16 34.5 Z" fill="var(--brand)" />
      <circle cx="16" cy="16" r="5" fill="var(--surface)" stroke="var(--line-strong)" />
    </svg>
  );
}
