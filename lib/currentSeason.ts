import { prisma } from "./db";

// Relative import on purpose: the Netlify Sheets-sync function imports this
// transitively and does not get Next.js's `@/` alias.

/** Phase 1 runs a single tournament; routing by tournament arrives in Phase 5. */
export const DEFAULT_TOURNAMENT_SLUG = "bfl";

/**
 * The edition the public site and admin console operate on by default — the
 * tournament's `currentSeasonId` pointer, falling back to the newest ACTIVE
 * season, then the newest season of any status. May be ARCHIVED (between
 * editions the site keeps showing the last finished one).
 */
export async function getCurrentSeason() {
  const tournament = await prisma.tournament.findUnique({ where: { slug: DEFAULT_TOURNAMENT_SLUG } });
  if (tournament?.currentSeasonId) {
    const season = await prisma.season.findUnique({ where: { id: tournament.currentSeasonId } });
    if (season) return season;
  }
  return prisma.season.findFirst({
    where: tournament ? { tournamentId: tournament.id } : undefined,
    // "ACTIVE" sorts before "ARCHIVED", then newest number first.
    orderBy: [{ status: "asc" }, { number: "desc" }],
  });
}

/**
 * The current edition only if it is still open (ACTIVE). Mutating admin and
 * registration flows use this so they can never write into a frozen edition —
 * it replaces the old "the one ACTIVE season" lookup.
 */
export async function getActiveSeason() {
  const season = await getCurrentSeason();
  return season?.status === "ACTIVE" ? season : null;
}

/** Id of the current edition, or null when no edition exists yet. */
export async function getCurrentSeasonId(): Promise<string | null> {
  return (await getCurrentSeason())?.id ?? null;
}
