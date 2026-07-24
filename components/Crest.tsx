export function Crest({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--pitch)" stroke="var(--line)" />
      <circle cx="16" cy="16" r="8" fill="var(--brand)" />
      <path
        d="M16 10.5l1.8 1.3-.7 2.1h-2.2l-.7-2.1z"
        fill="var(--surface)"
        opacity="0.9"
      />
    </svg>
  );
}
