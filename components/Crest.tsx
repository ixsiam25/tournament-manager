/**
 * Placeholder team crest, used wherever a team has no uploaded logo.
 *
 * Season IX teams registered without any artwork, and a row of identical grey
 * squares is useless pitch-side, so the crest is derived from the team name:
 * the same name always produces the same colour and initials. Mid-lightness
 * fills keep the white initials legible in both the light and dark themes.
 *
 * Pure and hook-free, so it renders in server and client components alike.
 */

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0; // keep it a 32-bit int
  }
  return Math.abs(hash);
}

/**
 * First letter of each of the first two words — "Molom Bahini" → "MB". Falls
 * back to the first two characters for single-word names ("Koshai-7" → "KO").
 * Works on Bengali names too, which is why it slices graphemes rather than
 * assuming ASCII: "কমিটির টীম" → "কট".
 */
function initials(name: string): string {
  const words = name.trim().split(/[\s\-–—]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return [...words[0]].slice(0, 2).join("").toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => [...w][0])
    .join("")
    .toUpperCase();
}

export function Crest({ size = 28, name }: { size?: number; name?: string | null }) {
  const height = Math.round((size * 36) / 32);

  // Without a name there is nothing to derive from, so keep the original
  // green/red BFL shield.
  const hue = name ? hashName(name) % 360 : null;
  const fill = hue === null ? "var(--pitch)" : `hsl(${hue} 62% 42%)`;
  const fillDark = hue === null ? "var(--brand)" : `hsl(${hue} 62% 32%)`;

  return (
    <svg width={size} height={height} viewBox="0 0 32 36" role="img" aria-label={name ?? undefined}>
      <path
        d="M16 1.5 L29 5.5 V17 C29 25.5 23.5 32 16 34.5 C8.5 32 3 25.5 3 17 V5.5 Z"
        fill={fill}
        stroke="var(--line-strong)"
        strokeWidth="1.5"
      />
      <path d="M16 1.5 L29 5.5 V17 C29 25.5 23.5 32 16 34.5 Z" fill={fillDark} />
      {name ? (
        <text
          x="16"
          y="18"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#ffffff"
          fontSize="13"
          fontWeight="700"
          letterSpacing="-0.5"
        >
          {initials(name)}
        </text>
      ) : (
        <circle cx="16" cy="16" r="5" fill="var(--surface)" stroke="var(--line-strong)" />
      )}
    </svg>
  );
}
