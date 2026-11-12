import { prisma } from "@/lib/db";

/**
 * Takes a player off their team and puts them back in the season's pool, as if they had
 * never been placed: no team, no shirt number, not captain. In an auction season their lot
 * is reopened (queued again) so they can be bid for. `onlyFree` limits the lot reopening to
 * free placements (a captain pick), leaving a real purchase alone.
 */
export async function returnPlayerToPool(playerId: string, opts: { onlyFree?: boolean } = {}) {
  await prisma.$transaction([
    prisma.auctionLot.updateMany({
      where: { playerId, status: "SOLD", ...(opts.onlyFree ? { soldPrice: 0 } : {}) },
      data: { status: "QUEUED", soldToTeamId: null, soldPrice: null, soldAt: null, soldByUserId: null },
    }),
    prisma.player.update({ where: { id: playerId }, data: { teamId: null, jerseyNumber: 0, isCaptain: false, placedAsCaptain: false } }),
  ]);
}
