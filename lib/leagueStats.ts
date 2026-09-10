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
 * All-time totals rolled up from every archived season's frozen
 * `resultsJson`. Reading the archives rather than the live tables is
 * deliberate: the live `Team`/`Match`/`Player` tables are wiped at each
 * rollover, so they only ever describe the season in progress.
 */
export async function getLeagueStats(): Promise<LeagueStats> {
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
