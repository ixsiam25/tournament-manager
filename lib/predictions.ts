import { prisma } from "@/lib/db";

export type PredictionTally = {
  matchId: string;
  homeVotes: number;
  awayVotes: number;
  total: number;
  homePct: number;
  awayPct: number;
  yourTeamId: string | null;
};

/** Aggregates votes for a match into a home/away split. `voterId` (if given)
 * is used only to report the caller's own pick — it never affects the tally
 * itself, which is a plain count of every Prediction row for the match. */
export async function getPredictionTally(
  matchId: string,
  homeTeamId: string | null,
  awayTeamId: string | null,
  voterId?: string | null,
): Promise<PredictionTally> {
  const [grouped, mine] = await Promise.all([
    prisma.prediction.groupBy({
      by: ["teamId"],
      where: { matchId },
      _count: { _all: true },
    }),
    voterId
      ? prisma.prediction.findUnique({
          where: { matchId_voterId: { matchId, voterId } },
          select: { teamId: true },
        })
      : Promise.resolve(null),
  ]);

  const homeVotes = grouped.find((g) => g.teamId === homeTeamId)?._count._all ?? 0;
  const awayVotes = grouped.find((g) => g.teamId === awayTeamId)?._count._all ?? 0;
  const total = homeVotes + awayVotes;

  return {
    matchId,
    homeVotes,
    awayVotes,
    total,
    homePct: total === 0 ? 50 : Math.round((homeVotes / total) * 100),
    awayPct: total === 0 ? 50 : Math.round((awayVotes / total) * 100),
    yourTeamId: mine?.teamId ?? null,
  };
}

export type ChampionTally = {
  counts: Record<string, number>;
  total: number;
  yourTeamId: string | null;
};

/** Aggregates every "who wins the season" pick across all teams. `voterId`
 * (if given) is used only to report the caller's own pick. */
export async function getChampionTally(voterId?: string | null): Promise<ChampionTally> {
  const [grouped, mine] = await Promise.all([
    prisma.championPrediction.groupBy({
      by: ["teamId"],
      _count: { _all: true },
    }),
    voterId
      ? prisma.championPrediction.findUnique({
          where: { voterId },
          select: { teamId: true },
        })
      : Promise.resolve(null),
  ]);

  const counts: Record<string, number> = {};
  let total = 0;
  for (const g of grouped) {
    counts[g.teamId] = g._count._all;
    total += g._count._all;
  }

  return { counts, total, yourTeamId: mine?.teamId ?? null };
}

export type ChampionResult = {
  championTeamId: string;
  championTeamName: string;
  /** Voters who named themselves and picked the actual champion. */
  correctVoterNames: string[];
  /** Predictions for the champion with no name attached — shown as a count. */
  anonymousCorrectCount: number;
  totalCorrect: number;
  totalPredictions: number;
};

/**
 * Once the Final has been played, resolves who actually won the season and
 * who called it. Returns null until there's a finished Final with a clear
 * winner. A drawn final is resolved via `winnerTeamId` — set either
 * automatically (clear regulation score) or by admin picking penalties/a
 * manual winner when finishing a drawn knockout match; a still-null
 * `winnerTeamId` on a level score means admin hasn't resolved it yet.
 */
export async function getChampionResult(): Promise<ChampionResult | null> {
  const final = await prisma.match.findFirst({
    where: { round: "FINAL", status: "FINISHED" },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!final || !final.homeTeam || !final.awayTeam) return null;

  let champion: typeof final.homeTeam;
  if (final.winnerTeamId) {
    champion = final.winnerTeamId === final.homeTeam.id ? final.homeTeam : final.awayTeam;
  } else if (final.homeScore !== final.awayScore) {
    champion = final.homeScore > final.awayScore ? final.homeTeam : final.awayTeam;
  } else {
    return null;
  }

  const [correctPredictions, totalPredictions] = await Promise.all([
    prisma.championPrediction.findMany({
      where: { teamId: champion.id },
      select: { voterName: true },
    }),
    prisma.championPrediction.count(),
  ]);

  const correctVoterNames = correctPredictions
    .map((p) => p.voterName?.trim())
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b));
  const anonymousCorrectCount = correctPredictions.length - correctVoterNames.length;

  return {
    championTeamId: champion.id,
    championTeamName: champion.name,
    correctVoterNames,
    anonymousCorrectCount,
    totalCorrect: correctPredictions.length,
    totalPredictions,
  };
}
