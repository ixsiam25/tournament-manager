import { prisma } from "./db";
import type { SeasonArchive } from "./seasonArchive";

export type LeagueStats = {
  seasonsPlayed: number;
  matchesPlayed: number;
  goalsScored: number;
  playersCapped: number;
  champion: { teamName: string; slug: string; seasonName: string; year: number } | null;
  goldenBoot: { name: string; goals: number } | null;
  mostDecorated: { teamName: string; titles: number } | null;
  /** Teams in the most recently archived season — the league's current size. */
  teamsLastSeason: number;
};

/**
 * Snapshot-based totals — the fallback for any archived season whose rows
 * haven't been rehydrated yet, and the reference the SQL path is tested
 * against. All-time totals rolled up from every archived season's frozen
 * `resultsJson`. Reading the archives rather than the live tables is
 * deliberate for now: the frozen snapshot is the immutable record of a past
 * edition. Live rows are no longer wiped at rollover (they carry a seasonId),
 * so a later phase can derive these totals with SQL instead.
 */
export async function getLeagueStatsFromSnapshots(): Promise<LeagueStats> {
  const seasons = await prisma.season.findMany({
    where: { status: "ARCHIVED" },
    orderBy: { number: "desc" },
    select: { slug: true, name: true, year: true, championTeamName: true, resultsJson: true },
  });

  let matchesPlayed = 0;
  let goalsScored = 0;
  const cappedPersonIds = new Set<string>();
  const goalsByPerson = new Map<string, { name: string; goals: number }>();
  const titlesByTeam = new Map<string, number>();
  let teamsLastSeason = 0;

  seasons.forEach((season, i) => {
    const archive = season.resultsJson as unknown as SeasonArchive | null;
    if (!archive) return;

    // `finishedMatches` rather than `matches` — a season can be archived with
    // fixtures that were scheduled and never played.
    matchesPlayed += archive.summary?.finishedMatches ?? 0;
    if (i === 0) teamsLastSeason = archive.summary?.teams ?? 0;

    for (const match of archive.matches ?? []) {
      if (match.status !== "FINISHED") continue;
      goalsScored += (match.homeScore ?? 0) + (match.awayScore ?? 0);
    }

    for (const player of archive.players ?? []) {
      if (player.personId) cappedPersonIds.add(player.personId);
    }

    for (const scorer of archive.topScorers ?? []) {
      if (!scorer.personId) continue;
      const current = goalsByPerson.get(scorer.personId);
      goalsByPerson.set(scorer.personId, {
        name: scorer.playerName,
        goals: (current?.goals ?? 0) + scorer.count,
      });
    }

    if (season.championTeamName) {
      titlesByTeam.set(season.championTeamName, (titlesByTeam.get(season.championTeamName) ?? 0) + 1);
    }
  });

  const topScorer = [...goalsByPerson.values()].sort(
    (a, b) => b.goals - a.goals || a.name.localeCompare(b.name),
  )[0];
  const decorated = [...titlesByTeam.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const latest = seasons[0];

  return {
    seasonsPlayed: seasons.length,
    matchesPlayed,
    goalsScored,
    playersCapped: cappedPersonIds.size,
    teamsLastSeason,
    champion:
      latest?.championTeamName != null
        ? { teamName: latest.championTeamName, slug: latest.slug, seasonName: latest.name, year: latest.year }
        : null,
    goldenBoot: topScorer ? { name: topScorer.name, goals: topScorer.goals } : null,
    mostDecorated: decorated ? { teamName: decorated[0], titles: decorated[1] } : null,
  };
}


/**
 * All-time totals computed with SQL over the season-scoped rows (Phase 1/2:
 * rows are no longer wiped, and every roster slot is a Person, so a person's
 * career and a franchise's titles are plain queries). Falls back to the
 * frozen snapshots while any archived season still lacks rows.
 */
export async function getLeagueStats(): Promise<LeagueStats> {
  const archived = await prisma.season.findMany({
    where: { status: "ARCHIVED" },
    orderBy: { number: "desc" },
    select: { id: true, slug: true, name: true, year: true, championTeamName: true, _count: { select: { teams: true } } },
  });
  if (archived.some((s) => s._count.teams === 0)) return getLeagueStatsFromSnapshots();

  const seasonIds = archived.map((s) => s.id);
  const inArchived = { seasonId: { in: seasonIds } };

  const [finished, cappedPlayers, goalEvents, finals] = await Promise.all([
    prisma.match.findMany({ where: { ...inArchived, status: "FINISHED" }, select: { homeScore: true, awayScore: true } }),
    prisma.player.findMany({ where: { ...inArchived, teamId: { not: null } }, select: { personId: true } }),
    prisma.matchEvent.groupBy({
      by: ["playerId"],
      where: { type: "GOAL", match: inArchived },
      _count: { _all: true },
    }),
    prisma.match.findMany({
      where: { ...inArchived, round: "FINAL", status: "FINISHED" },
      select: {
        homeScore: true,
        awayScore: true,
        winnerTeamId: true,
        homeTeam: { select: { id: true, franchise: { select: { id: true, name: true } } } },
        awayTeam: { select: { id: true, franchise: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  // Goals per person (a Person's goals follow them across teams and seasons).
  const scorers = await prisma.player.findMany({
    where: { id: { in: goalEvents.map((g) => g.playerId) } },
    select: { id: true, personId: true, person: { select: { name: true } } },
  });
  const personByPlayer = new Map(scorers.map((p) => [p.id, p]));
  const goalsByPerson = new Map<string, { name: string; goals: number }>();
  for (const g of goalEvents) {
    const p = personByPlayer.get(g.playerId);
    if (!p) continue;
    const cur = goalsByPerson.get(p.personId);
    goalsByPerson.set(p.personId, { name: p.person.name, goals: (cur?.goals ?? 0) + g._count._all });
  }
  const topScorer = [...goalsByPerson.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))[0];

  // Titles per franchise: the winner of each finished FINAL.
  const titles = new Map<string, { name: string; titles: number }>();
  for (const f of finals) {
    const home = f.homeTeam;
    const away = f.awayTeam;
    if (!home || !away) continue;
    const winner = f.winnerTeamId
      ? f.winnerTeamId === home.id
        ? home
        : away
      : f.homeScore === f.awayScore
        ? null
        : f.homeScore > f.awayScore
          ? home
          : away;
    if (!winner) continue;
    const cur = titles.get(winner.franchise.id);
    titles.set(winner.franchise.id, { name: winner.franchise.name, titles: (cur?.titles ?? 0) + 1 });
  }
  const decorated = [...titles.values()].sort((a, b) => b.titles - a.titles || a.name.localeCompare(b.name))[0];

  const latest = archived[0];
  return {
    seasonsPlayed: archived.length,
    matchesPlayed: finished.length,
    goalsScored: finished.reduce((sum, m) => sum + m.homeScore + m.awayScore, 0),
    playersCapped: new Set(cappedPlayers.map((p) => p.personId)).size,
    teamsLastSeason: latest?._count.teams ?? 0,
    champion:
      latest?.championTeamName != null
        ? { teamName: latest.championTeamName, slug: latest.slug, seasonName: latest.name, year: latest.year }
        : null,
    goldenBoot: topScorer ? { name: topScorer.name, goals: topScorer.goals } : null,
    mostDecorated: decorated ? { teamName: decorated.name, titles: decorated.titles } : null,
  };
}
