import { prisma } from "@/lib/db";

/** An edition is "in play" once any match has started. From then on roster
 * changes are real transfers/replacements and get flagged as such in the
 * audit log (they are still allowed — the organiser always has the last word). */
export async function seasonInPlay(seasonId: string): Promise<boolean> {
  const started = await prisma.match.count({ where: { seasonId, status: { in: ["LIVE", "FINISHED"] } } });
  return started > 0;
}

/** Lowest positive jersey number not already worn on the team. Released
 * players park their number as a negative, so it is free again. */
export async function nextFreeJersey(teamId: string): Promise<number> {
  const used = new Set(
    (await prisma.player.findMany({ where: { teamId, jerseyNumber: { gt: 0 } }, select: { jerseyNumber: true } })).map(
      (p) => p.jerseyNumber,
    ),
  );
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/** Same as `nextFreeJersey` but for a batch of players joining at once: hands out
 * consecutive free numbers without re-querying between assignments. */
export function assignJerseys(used: Set<number>, count: number): number[] {
  const out: number[] = [];
  let n = 1;
  while (out.length < count) {
    if (!used.has(n)) {
      out.push(n);
      used.add(n);
    }
    n++;
  }
  return out;
}
