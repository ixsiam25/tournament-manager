/**
 * Pure team-formation logic (no database): turn order for a snake draft and
 * the balanced random deal. Kept separate so it can be unit-tested with a
 * seeded random generator and reused by the board UI.
 */

export type Pos = "GK" | "DEF" | "MID" | "FWD";

export type PoolPlayer = {
  id: string;
  name: string;
  position: Pos | null;
  /** Organiser-set overall rating; null until ratings exist. */
  rating: number | null;
};

export type DealTeam = { id: string; name: string; count: number; max: number };

/** Deterministic PRNG so a "deal" can be previewed, re-rolled with a new seed,
 * and reproduced exactly when applied. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Index (0-based, into the draft order) of the team that owns pick number
 * `pickIndex` in a snake draft: 0,1,2,…,n-1, n-1,…,1,0, 0,1,… */
export function snakeTeamIndex(teamCount: number, pickIndex: number): number {
  if (teamCount <= 0) throw new Error("A draft needs at least one team");
  const round = Math.floor(pickIndex / teamCount);
  const within = pickIndex % teamCount;
  return round % 2 === 0 ? within : teamCount - 1 - within;
}

const POSITION_ORDER: (Pos | null)[] = ["GK", "DEF", "MID", "FWD", null];

export type Deal = {
  /** playerId -> teamId */
  assignments: Map<string, string>;
  /** Players nobody had room for. */
  leftover: string[];
};

/**
 * Deals the pool to the teams as evenly as possible:
 * - positions are dealt one group at a time (GK, DEF, MID, FWD, unspecified),
 *   so every team gets a fair share of each role;
 * - inside a group, stronger-rated players go first and ties are shuffled, so
 *   a snake pass over the teams evens out strength (with no ratings yet it is
 *   a plain fair random deal);
 * - the snake pointer carries across groups and skips teams that are full.
 */
export function balancedDeal(pool: PoolPlayer[], teams: DealTeam[], rng: () => number): Deal {
  const assignments = new Map<string, string>();
  const room = new Map(teams.map((t) => [t.id, t.max - t.count]));
  const order = shuffle(teams, rng).map((t) => t.id);
  const leftover: string[] = [];
  let pick = 0;

  for (const position of POSITION_ORDER) {
    const group = shuffle(
      pool.filter((p) => p.position === position),
      rng,
    ).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

    for (const player of group) {
      let placed = false;
      for (let tries = 0; tries < order.length; tries++) {
        const teamId = order[snakeTeamIndex(order.length, pick)];
        pick++;
        if ((room.get(teamId) ?? 0) > 0) {
          assignments.set(player.id, teamId);
          room.set(teamId, (room.get(teamId) ?? 0) - 1);
          placed = true;
          break;
        }
      }
      if (!placed) leftover.push(player.id);
    }
  }
  return { assignments, leftover };
}

export type DraftState = {
  kind: "DRAFT";
  /** Team ids in round-1 pick order. */
  order: string[];
  picks: { playerId: string; teamId: string }[];
};

export function isDraftState(value: unknown): value is DraftState {
  const v = value as DraftState | null;
  return !!v && v.kind === "DRAFT" && Array.isArray(v.order) && Array.isArray(v.picks);
}

/** The team on the clock, skipping teams that are already full. Returns null
 * when nobody has room left. */
export function teamOnTheClock(state: DraftState, countByTeam: Map<string, number>, max: number): string | null {
  let pick = state.picks.length;
  for (let tries = 0; tries < state.order.length * 2; tries++) {
    const teamId = state.order[snakeTeamIndex(state.order.length, pick)];
    if ((countByTeam.get(teamId) ?? 0) < max) return teamId;
    pick++;
  }
  return null;
}
