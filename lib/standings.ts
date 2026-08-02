import { prisma } from "./db";

export type StandingRow = {
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

/**
 * Standings are derived from finished league matches on every read, rather
 * than stored, so a corrected score or an undone event can never leave the
 * table out of sync.
 */
export async function getStandings(): Promise<StandingRow[]> {
  const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });
  const matches = await prisma.match.findMany({
    where: { round: "LEAGUE", status: "FINISHED" },
  });

  const rows = new Map<string, StandingRow>(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        teamName: team.name,
        logoUrl: team.logoUrl,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      },
    ]),
  );

  for (const match of matches) {
    if (!match.homeTeamId || !match.awayTeamId) continue;
    const home = rows.get(match.homeTeamId);
    const away = rows.get(match.awayTeamId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (match.homeScore < match.awayScore) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const row of rows.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  return Array.from(rows.values()).sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamName.localeCompare(b.teamName),
  );
}
