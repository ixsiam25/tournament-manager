import { prisma } from "@/lib/db";

/** Approved applications that have no player in the season (e.g. their team was deleted by an older version that removed players with it). */
export async function findMissingPlayers(seasonId: string) {
  const regs = await prisma.registration.findMany({ where: { seasonId, status: "APPROVED" } });
  const players = await prisma.player.findMany({ where: { seasonId }, select: { personId: true } });
  const have = new Set(players.map((p) => p.personId));
  return regs.filter((r) => !r.personId || !have.has(r.personId));
}

export async function countMissingPlayers(seasonId: string) {
  return (await findMissingPlayers(seasonId)).length;
}
