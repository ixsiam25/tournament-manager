/**
 * Player-card rating model (pure, no database). Football preset: six stats per
 * player, an overall that weights them by position, a tier from the overall,
 * and a capped "form" bonus earned from goals/assists during the edition.
 *
 * Ratings are organiser-set — players never rate themselves — and live on the
 * Player row (one card per person per edition, so a card follows them between
 * teams inside the edition).
 */
export type Position = "GK" | "DEF" | "MID" | "FWD";

export const OUTFIELD_KEYS = ["pac", "sho", "pas", "dri", "def", "phy"] as const;
export const KEEPER_KEYS = ["div", "han", "kic", "ref", "spe", "pos"] as const;
export type StatKey = (typeof OUTFIELD_KEYS)[number] | (typeof KEEPER_KEYS)[number];
export type Ratings = Partial<Record<StatKey, number>>;

export const STAT_LABELS: Record<StatKey, string> = {
  pac: "PAC", sho: "SHO", pas: "PAS", dri: "DRI", def: "DEF", phy: "PHY",
  div: "DIV", han: "HAN", kic: "KIC", ref: "REF", spe: "SPE", pos: "POS",
};

/** Until organisers rate players, every card shows this rating (temporary league-wide default). */
export const DEFAULT_RATING = 89;
export const RATING_MIN = 30;
export const RATING_MAX = 99;

export function statKeysFor(position: Position | null): readonly StatKey[] {
  return position === "GK" ? KEEPER_KEYS : OUTFIELD_KEYS;
}

/** Weights per position, in the order of `statKeysFor(position)`. Each row sums to 1. */
const WEIGHTS: Record<Position | "ANY", number[]> = {
  FWD: [0.2, 0.3, 0.1, 0.25, 0, 0.15],
  MID: [0.1, 0.15, 0.3, 0.25, 0.1, 0.1],
  DEF: [0.1, 0, 0.15, 0.1, 0.45, 0.2],
  GK: [0.2, 0.15, 0.1, 0.25, 0.1, 0.2],
  ANY: [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6],
};

export type Tier = "bronze" | "silver" | "gold" | "special";
export const TIERS: Tier[] = ["bronze", "silver", "gold", "special"];
export const TIER_THRESHOLDS = { silver: 60, gold: 75 } as const;

/** Keeps only valid numeric ratings for the keys this position uses, clamped
 * to the allowed range. Anything else in the stored JSON is ignored. */
export function sanitizeRatings(raw: unknown, position: Position | null): Ratings {
  const out: Ratings = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of statKeysFor(position)) {
    const n = Math.round(Number((raw as Record<string, unknown>)[key]));
    if (Number.isFinite(n)) out[key] = Math.min(RATING_MAX, Math.max(RATING_MIN, n));
  }
  return out;
}

/** Position-weighted overall, or null until all six stats are set. */
export function computeOverall(position: Position | null, ratings: Ratings): number | null {
  const keys = statKeysFor(position);
  const w = WEIGHTS[position ?? "ANY"];
  let total = 0;
  for (let i = 0; i < keys.length; i++) {
    const v = ratings[keys[i]];
    if (v === undefined) return null;
    total += v * w[i];
  }
  return Math.round(total);
}

export const MAX_FORM_BONUS = 5;

/** Form bonus from live stats: +1 per goal, +½ per assist, capped. Keepers get
 * none (their stats aren't goal-based). */
export function formBonus(position: Position | null, stats: { goals: number; assists: number }): number {
  if (position === "GK") return 0;
  return Math.min(MAX_FORM_BONUS, Math.floor(stats.goals + stats.assists * 0.5));
}

export function tierFor(overall: number | null, override?: string | null): Tier {
  if (override && (TIERS as string[]).includes(override)) return override as Tier;
  if (overall === null) return "gold"; // unrated cards show the default gold look
  if (overall >= TIER_THRESHOLDS.gold) return "gold";
  if (overall >= TIER_THRESHOLDS.silver) return "silver";
  return "bronze";
}

export type CardStat = { key: StatKey; label: string; value: number | null };
export type CardModel = {
  position: Position | null;
  /** Base (organiser) overall, null while unrated. */
  base: number | null;
  /** True once an organiser has saved ratings for this player (until then the default shows). */
  rated: boolean;
  bonus: number;
  /** What the card displays: base + form bonus, capped at 99. */
  overall: number | null;
  tier: Tier;
  stats: CardStat[];
};

/** Everything the card needs from a player's stored ratings + live stats. */
export function buildCardModel(input: {
  position: Position | null;
  ratings: unknown;
  cardTier?: string | null;
  stats?: { goals: number; assists: number };
}): CardModel {
  const stored = sanitizeRatings(input.ratings, input.position);
  const ratings: Ratings = Object.fromEntries(statKeysFor(input.position).map((key) => [key, stored[key] ?? DEFAULT_RATING]));
  const base = computeOverall(input.position, ratings);
  const rated = statKeysFor(input.position).every((k) => stored[k] !== undefined);
  const bonus = base === null ? 0 : formBonus(input.position, input.stats ?? { goals: 0, assists: 0 });
  const overall = base === null ? null : Math.min(RATING_MAX, base + bonus);
  return {
    position: input.position,
    base,
    rated,
    bonus,
    overall,
    tier: tierFor(overall, input.cardTier),
    stats: statKeysFor(input.position).map((key) => ({ key, label: STAT_LABELS[key], value: ratings[key] ?? null })),
  };
}
