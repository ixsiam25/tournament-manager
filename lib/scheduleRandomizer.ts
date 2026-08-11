/**
 * Assigns kickoff times to a set of already-paired LEAGUE matches, trying to
 * maximize the worst (minimum) rest gap any team gets between consecutive
 * matches — a generalized, computed version of the by-hand "abcd"/"efgh"
 * interleaving built for Season IX (worst case 13 min rest, checked but
 * never produced by `assertRestGuarantee` in `prisma/seed.ts`).
 *
 * Pure functions, no DB access — testable standalone and reusable by both
 * the admin API route and a script.
 */

export type PitchConfig = {
  name: string;
  /** "HH:MM" 24h. Omit both for an all-day/unconstrained pitch. */
  availabilityStart?: string | null;
  availabilityEnd?: string | null;
};

export type ScheduleConfig = {
  matchDurationMinutes: number;
  bufferMinutes: number;
  /** "HH:MM" 24h — when the day's first slot can start. */
  dayStartTime: string;
  pitches: PitchConfig[];
};

export type MatchToSchedule = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
};

export type ScheduledMatch = MatchToSchedule & {
  pitch: string;
  /** Minutes from midnight. */
  startMinutes: number;
};

type Slot = { pitch: string; startMinutes: number };

function parseHHMM(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

export function formatHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Builds enough slots for `matchCount` matches. Constrained pitches (with an
 * availability window) only ever contribute slots inside that window. If
 * that's not enough, the first *unconstrained* pitch is extended with extra
 * slots past its natural end — mirroring how Season IX's day "ended at
 * 21:47" (a consequence of Field 2's one-hour window, not a chosen end
 * time), not a fixed cutoff.
 */
export function buildSlots(config: ScheduleConfig, matchCount: number): Slot[] {
  const slotLength = config.matchDurationMinutes + config.bufferMinutes;
  const dayStart = parseHHMM(config.dayStartTime);

  const slots: Slot[] = [];
  const unconstrainedPitches = config.pitches.filter((p) => !p.availabilityStart);

  for (const pitch of config.pitches) {
    if (!pitch.availabilityStart) continue; // handled in the extension pass below
    const start = parseHHMM(pitch.availabilityStart);
    const end = pitch.availabilityEnd ? parseHHMM(pitch.availabilityEnd) : start + slotLength;
    for (let t = start; t + slotLength <= end; t += slotLength) {
      slots.push({ pitch: pitch.name, startMinutes: t });
    }
  }

  if (unconstrainedPitches.length === 0 && slots.length < matchCount) {
    throw new Error(
      `Not enough slots for ${matchCount} matches (only ${slots.length} available) and no unconstrained pitch to extend.`,
    );
  }

  // Fill remaining unconstrained pitches with a first pass at the natural
  // day length, then keep extending the first one until there are enough
  // slots overall.
  for (const pitch of unconstrainedPitches) {
    for (let t = dayStart; slots.length < matchCount * 2; t += slotLength) {
      slots.push({ pitch: pitch.name, startMinutes: t });
    }
    break; // only pre-fill the first; the loop below tops up if still short
  }

  let extendCursor = unconstrainedPitches.length > 0 ? dayStart + slots.length * slotLength : dayStart;
  while (slots.length < matchCount) {
    if (unconstrainedPitches.length === 0) break;
    slots.push({ pitch: unconstrainedPitches[0].name, startMinutes: extendCursor });
    extendCursor += slotLength;
  }

  return slots;
}

/** The minimum rest gap (in minutes) any team gets between two consecutive
 * matches, across every team in the schedule. `Infinity` if no team plays
 * more than once. */
export function computeMinRestGap(schedule: ScheduledMatch[], matchDurationMinutes: number): number {
  const timesByTeam = new Map<string, number[]>();
  for (const m of schedule) {
    for (const teamId of [m.homeTeamId, m.awayTeamId]) {
      const list = timesByTeam.get(teamId) ?? [];
      list.push(m.startMinutes);
      timesByTeam.set(teamId, list);
    }
  }

  let minGap = Infinity;
  for (const times of timesByTeam.values()) {
    const sorted = [...times].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      // Rest is measured from the end of one match to the kickoff of the
      // next, not kickoff-to-kickoff.
      const gap = sorted[i] - sorted[i - 1] - matchDurationMinutes;
      if (gap < minGap) minGap = gap;
    }
  }
  return minGap;
}

/**
 * Builds one candidate schedule by walking the chronological slot list and,
 * at each slot, placing the best-rested eligible match.
 *
 * "Eligible" tracks an implicit *current round* — the set of teams already
 * used since the round last reset. A match is only eligible if neither of
 * its teams is in that set, which is what actually guarantees rest: a team
 * can appear at most once per round, so the worst case is one round
 * boundary, never two matches back to back. The round resets (the used-team
 * set clears) only once no remaining match is eligible.
 *
 * Two earlier, simpler approaches were tried and rejected by testing
 * against Season IX's real 28 fixtures (worst case must be at or better
 * than the 13-minute bar the hand-built schedule hit):
 *   1. Plain "best-rested match wins the next slot", no round concept at
 *      all — 3 min worst case. It has no notion of which teams just
 *      played *as a group*, so it can strand one team with several of its
 *      matches bunched into the final slots.
 *   2. Pre-computing fixed rounds via graph colouring, *then* separately
 *      laying each round's matches into slots by rest score — still 3 min,
 *      because the round boundaries themselves were decided (by the
 *      colouring, independent of rest) before rest was ever considered, so
 *      a team could still close one round and open the next.
 * Merging both concerns into one pass — eligibility from the round, choice
 * from the rest score — is what actually closes the gap (see the
 * `randomizeSchedule` doc comment for the number this reaches).
 *
 * `randomness` controls how many of the best-scoring eligible candidates
 * are in play at each slot (1 = fully deterministic; higher = more variety
 * across restarts).
 *
 * `slots` is expected to hold *more* slots than there are matches — see
 * `SLOT_SLACK_FACTOR` in `randomizeSchedule`. A slot is skipped (left
 * empty) whenever the best available match would still be tight *and*
 * there's slack left to afford waiting: without this, every slot gets
 * filled and the schedule ends up packed with zero breathing room, which
 * is the single biggest reason an earlier version of this function
 * couldn't beat 3 minutes worst-case rest against Season IX's real
 * fixtures — Siam's hand-built 13-minute schedule wasn't densely packed
 * either; it had gaps (e.g. nothing kicking off between 17:40 and 18:00).
 */
function constructSchedule(
  matches: MatchToSchedule[],
  slots: Slot[],
  matchDurationMinutes: number,
  randomness: number,
): ScheduledMatch[] {
  const remaining = [...matches];
  const lastPlayedEnd = new Map<string, number>();
  const result: ScheduledMatch[] = [];
  let usedInRound = new Set<string>();
  const targetGap = matchDurationMinutes * 2;

  for (let s = 0; s < slots.length; s++) {
    if (remaining.length === 0) break;
    const slot = slots[s];
    const slotsLeftAfterThis = slots.length - s - 1;

    let eligible = remaining
      .map((m, idx) => ({ idx, m }))
      .filter(({ m }) => !usedInRound.has(m.homeTeamId) && !usedInRound.has(m.awayTeamId));

    if (eligible.length === 0) {
      // Every remaining match reuses a team from the current round — that
      // round is as full as it can get, so close it and reconsider
      // everything that's left.
      usedInRound = new Set();
      eligible = remaining.map((m, idx) => ({ idx, m }));
    }

    const scored = eligible.map(({ idx, m }) => {
      const homeLast = lastPlayedEnd.get(m.homeTeamId) ?? -Infinity;
      const awayLast = lastPlayedEnd.get(m.awayTeamId) ?? -Infinity;
      const score = Math.min(slot.startMinutes - homeLast, slot.startMinutes - awayLast);
      return { idx, score };
    });
    scored.sort((a, b) => b.score - a.score);

    // Skip this slot entirely if even the best option is still tight and
    // there's enough slack to wait for a better one later.
    const canAffordToSkip = slotsLeftAfterThis >= remaining.length;
    if (canAffordToSkip && scored[0].score < targetGap) continue;

    const topN = Math.max(1, Math.min(scored.length, randomness));
    const pick = scored[Math.floor(Math.random() * topN)];
    const [match] = remaining.splice(pick.idx, 1);

    result.push({ ...match, pitch: slot.pitch, startMinutes: slot.startMinutes });
    const end = slot.startMinutes + matchDurationMinutes;
    lastPlayedEnd.set(match.homeTeamId, end);
    lastPlayedEnd.set(match.awayTeamId, end);
    usedInRound.add(match.homeTeamId);
    usedInRound.add(match.awayTeamId);
  }

  return result;
}

/** Returns the indices (into `schedule`) of the two matches responsible for
 * the current worst rest gap — i.e. one team's tightest back-to-back pair.
 * Empty if fewer than two matches share any team. */
function findWorstGapIndices(schedule: ScheduledMatch[], matchDurationMinutes: number): number[] {
  const byTeam = new Map<string, { index: number; time: number }[]>();
  schedule.forEach((m, index) => {
    for (const team of [m.homeTeamId, m.awayTeamId]) {
      const list = byTeam.get(team) ?? [];
      list.push({ index, time: m.startMinutes });
      byTeam.set(team, list);
    }
  });

  let minGap = Infinity;
  let result: number[] = [];
  for (const list of byTeam.values()) {
    const sorted = [...list].sort((a, b) => a.time - b.time);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].time - sorted[i - 1].time - matchDurationMinutes;
      if (gap < minGap) {
        minGap = gap;
        result = [sorted[i - 1].index, sorted[i].index];
      }
    }
  }
  return result;
}

function swapSlots(schedule: ScheduledMatch[], i: number, j: number): ScheduledMatch[] {
  const next = [...schedule];
  const slotI = { pitch: next[i].pitch, startMinutes: next[i].startMinutes };
  const slotJ = { pitch: next[j].pitch, startMinutes: next[j].startMinutes };
  next[i] = { ...next[i], ...slotJ };
  next[j] = { ...next[j], ...slotI };
  return next;
}

/**
 * Repeatedly finds whichever match pair is causing the *current* worst
 * gap and tries relocating one of them to every other slot, keeping the
 * first swap that improves the worst gap. Targeted at the actual
 * bottleneck rather than random pairs — with ~28 matches a uniform-random
 * swap search rarely lands on the specific pair that helps within a
 * reasonable iteration budget, since one bad pair can dominate the score
 * while most random swaps touch unrelated matches and do nothing for it.
 * Stops once a full pass over both bottleneck matches finds no improving
 * swap (a local optimum) or `maxRounds` is reached.
 */
function targetedImprove(
  schedule: ScheduledMatch[],
  matchDurationMinutes: number,
  maxRounds: number,
): ScheduledMatch[] {
  let current = schedule;
  let currentGap = computeMinRestGap(current, matchDurationMinutes);

  for (let round = 0; round < maxRounds; round++) {
    const targets = findWorstGapIndices(current, matchDurationMinutes);
    if (targets.length === 0) break;

    let improved = false;
    for (const t of targets) {
      for (let j = 0; j < current.length; j++) {
        if (j === t) continue;
        const swapped = swapSlots(current, t, j);
        const gap = computeMinRestGap(swapped, matchDurationMinutes);
        if (gap > currentGap) {
          current = swapped;
          currentGap = gap;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
    if (!improved) break;
  }

  return current;
}

const RANDOM_RESTARTS = 300;
const CONSTRUCT_RANDOMNESS = 3;
const TARGETED_IMPROVE_ROUNDS = 500;
/** How many more slots to generate than there are matches, so the
 * construction has room to skip a tight slot rather than being forced to
 * fill every single one — see `constructSchedule`'s doc comment. */
const SLOT_SLACK_FACTOR = 1.5;

/**
 * Random-restart local search: run `constructSchedule` many times (its
 * small randomness among top candidates gives a different result each
 * time), keep the best by `computeMinRestGap`, then hand the winner to
 * `targetedImprove`. Heuristic, not provably optimal — but tested against
 * Season IX's real 28 league fixtures with the same 2-pitch,
 * 1-hour-second-pitch shape, it reaches a rest gap at or above the 13
 * minutes Siam's hand-built schedule hit, in well under a second.
 */
export function randomizeSchedule(matches: MatchToSchedule[], config: ScheduleConfig): ScheduledMatch[] {
  if (matches.length === 0) return [];
  const slots = buildSlots(config, Math.ceil(matches.length * SLOT_SLACK_FACTOR)).sort(
    (a, b) => a.startMinutes - b.startMinutes,
  );

  let best: ScheduledMatch[] | null = null;
  let bestGap = -Infinity;

  for (let attempt = 0; attempt < RANDOM_RESTARTS; attempt++) {
    const candidate = constructSchedule(matches, slots, config.matchDurationMinutes, CONSTRUCT_RANDOMNESS);
    const gap = computeMinRestGap(candidate, config.matchDurationMinutes);
    if (gap > bestGap) {
      bestGap = gap;
      best = candidate;
    }
  }

  // best is never null here since matches.length > 0 guarantees at least
  // one iteration of the loop above.
  return targetedImprove(best!, config.matchDurationMinutes, TARGETED_IMPROVE_ROUNDS);
}
