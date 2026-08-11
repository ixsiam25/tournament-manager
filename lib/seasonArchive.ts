import { prisma } from "./db";
import { getStandings, type StandingRow } from "./standings";
import { getTopScorers, getTopAssists, type PlayerStatRow } from "./playerStats";
import { getChampionResult, type ChampionResult } from "./predictions";
import { MATCH_DISPLAY_ORDER_BY } from "./matchOrder";

export type SeasonArchive = {
  exportedAt: string;
  summary: {
    teams: number;
    players: number;
    matches: number;
    finishedMatches: number;
    events: number;
  };
  championResult: ChampionResult | null;
  finalStandings: StandingRow[];
  /** `PlayerStatRow` plus `personId`, joined in here rather than added to
   * the shared live type — only the frozen archive needs it, for
   * `/legacy/hall-of-fame`'s all-time aggregates. */
  topScorers: (PlayerStatRow & { personId: string | null })[];
  topAssists: (PlayerStatRow & { personId: string | null })[];
  teams: {
    id: string;
    name: string;
    shortName: string | null;
    semester: number | null;
    managerName: string | null;
    logoUrl: string | null;
    managerLoginBlocked: boolean;
    createdAt: string;
    updatedAt: string;
  }[];
  players: {
    id: string;
    name: string;
    jerseyNumber: number;
    position: string | null;
    isCaptain: boolean;
    photoUrl: string | null;
    teamId: string;
    teamName: string;
    /** Links to the stable cross-season identity — this is what makes the
     * `/legacy/hall-of-fame` all-time aggregates possible. */
    personId: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  matches: {
    id: string;
    round: string;
    label: string | null;
    homeTeam: string | null;
    awayTeam: string | null;
    homeScore: number;
    awayScore: number;
    status: string;
    scheduledAt: string | null;
    venue: string | null;
    mainReferee: string | null;
    assistantReferee: string | null;
    winnerTeam: string | null;
    penaltyHomeScore: number | null;
    penaltyAwayScore: number | null;
    extraTimePlayed: boolean;
    startedAt: string | null;
    finishedAt: string | null;
  }[];
  matchEvents: {
    matchId: string;
    matchLabel: string | null;
    round: string;
    type: string;
    team: string;
    player: string;
    groupId: string;
    sequence: number;
  }[];
  predictions: {
    matchId: string;
    matchLabel: string | null;
    team: string;
    voterName: string | null;
    voterSemester: string | null;
  }[];
  championPredictions: {
    team: string;
    voterName: string | null;
    voterSemester: string | null;
  }[];
};

/**
 * Builds the full frozen record for the current live season — the shape
 * written to `Season.resultsJson` at rollover (Stage 4.1) and, once, to
 * backfill the Season IX row directly (Stage 1). Deliberately rebuilt from
 * scratch rather than reusing the 2026-08-05 one-off backup script, which
 * predated (and so never captured) `winnerTeam`/referee/penalty fields.
 *
 * `Team.managerPasswordHash` is deliberately excluded — there's no
 * legitimate reason to persist a password hash into an archive record that
 * may end up rendered on a public legacy page.
 */
export async function buildSeasonArchive(): Promise<SeasonArchive> {
  const [teams, players, matches, matchEvents, predictions, championPredictions, standings, topScorers, topAssists, championResult] =
    await Promise.all([
      prisma.team.findMany({ orderBy: { name: "asc" } }),
      prisma.player.findMany({
        // Excludes any never-sold AUCTION-season player -- the archive
        // represents who actually played, not raw registration leftovers.
        where: { teamId: { not: null } },
        include: { team: true },
        orderBy: [{ teamId: "asc" }, { jerseyNumber: "asc" }],
      }),
      prisma.match.findMany({
        include: { homeTeam: true, awayTeam: true, winnerTeam: true },
        orderBy: MATCH_DISPLAY_ORDER_BY,
      }),
      prisma.matchEvent.findMany({
        include: { match: true, team: true, player: true },
        orderBy: [{ matchId: "asc" }, { sequence: "asc" }],
      }),
      prisma.prediction.findMany({
        include: { match: true, team: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.championPrediction.findMany({
        include: { team: true },
        orderBy: { createdAt: "asc" },
      }),
      getStandings(),
      getTopScorers(),
      getTopAssists(),
      getChampionResult(),
    ]);

  const finishedMatches = matches.filter((m) => m.status === "FINISHED").length;
  const personIdByPlayerId = new Map(players.map((p) => [p.id, p.personId]));

  return {
    exportedAt: new Date().toISOString(),
    summary: {
      teams: teams.length,
      players: players.length,
      matches: matches.length,
      finishedMatches,
      events: matchEvents.length,
    },
    championResult,
    finalStandings: standings,
    topScorers: topScorers.map((s) => ({ ...s, personId: personIdByPlayerId.get(s.playerId) ?? null })),
    topAssists: topAssists.map((s) => ({ ...s, personId: personIdByPlayerId.get(s.playerId) ?? null })),
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      semester: t.semester,
      managerName: t.managerName,
      logoUrl: t.logoUrl,
      managerLoginBlocked: t.managerLoginBlocked,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
    players: players
      .filter((p): p is typeof p & { teamId: string; team: NonNullable<typeof p.team> } => p.team !== null)
      .map((p) => ({
        id: p.id,
        name: p.name,
        jerseyNumber: p.jerseyNumber,
        position: p.position,
        isCaptain: p.isCaptain,
        photoUrl: p.photoUrl,
        teamId: p.teamId,
        teamName: p.team.name,
        personId: p.personId,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    matches: matches.map((m) => ({
      id: m.id,
      round: m.round,
      label: m.label,
      homeTeam: m.homeTeam?.name ?? null,
      awayTeam: m.awayTeam?.name ?? null,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      scheduledAt: m.scheduledAt?.toISOString() ?? null,
      venue: m.venue,
      mainReferee: m.mainReferee,
      assistantReferee: m.assistantReferee,
      winnerTeam: m.winnerTeam?.name ?? null,
      penaltyHomeScore: m.penaltyHomeScore,
      penaltyAwayScore: m.penaltyAwayScore,
      extraTimePlayed: m.extraTimePlayed,
      startedAt: m.startedAt?.toISOString() ?? null,
      finishedAt: m.finishedAt?.toISOString() ?? null,
    })),
    matchEvents: matchEvents.map((e) => ({
      matchId: e.matchId,
      matchLabel: e.match.label,
      round: e.match.round,
      type: e.type,
      team: e.team.name,
      player: e.player.name,
      groupId: e.groupId,
      sequence: e.sequence,
    })),
    predictions: predictions.map((p) => ({
      matchId: p.matchId,
      matchLabel: p.match.label,
      team: p.team.name,
      voterName: p.voterName,
      voterSemester: p.voterSemester,
    })),
    championPredictions: championPredictions.map((cp) => ({
      team: cp.team.name,
      voterName: cp.voterName,
      voterSemester: cp.voterSemester,
    })),
  };
}
