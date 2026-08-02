import { prisma } from "@/lib/db";

export type PlayerStatRow = {
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamName: string;
  photoUrl: string | null;
  count: number;
};

/**
 * Includes events from LIVE matches (not just FINISHED) so scorer/assist
 * leaderboards update while a match is still in progress.
 */
async function getPlayerEventCounts(type: "GOAL" | "ASSIST"): Promise<PlayerStatRow[]> {
  const grouped = await prisma.matchEvent.groupBy({
    by: ["playerId"],
    where: { type, match: { status: { in: ["LIVE", "FINISHED"] } } },
    _count: { _all: true },
  });

  if (grouped.length === 0) return [];

  const players = await prisma.player.findMany({
    where: { id: { in: grouped.map((g) => g.playerId) } },
    include: { team: true },
  });
  const playerById = new Map(players.map((p) => [p.id, p]));

  return grouped
    .map((g) => {
      const player = playerById.get(g.playerId);
      return {
        playerId: g.playerId,
        playerName: player?.name ?? "Unknown player",
        teamId: player?.teamId ?? null,
        teamName: player?.team.name ?? "Unknown team",
        photoUrl: player?.photoUrl ?? null,
        count: g._count._all,
      };
    })
    .sort((a, b) => b.count - a.count || a.playerName.localeCompare(b.playerName));
}

export function getTopScorers(): Promise<PlayerStatRow[]> {
  return getPlayerEventCounts("GOAL");
}

export function getTopAssists(): Promise<PlayerStatRow[]> {
  return getPlayerEventCounts("ASSIST");
}
