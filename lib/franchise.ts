import { prisma } from "@/lib/db";

/** Finds the tournament's Franchise with this exact name or creates it, so a
 * team that returns next edition under the same name stays one identity. */
export async function findOrCreateFranchise(tournamentId: string, name: string, shortName?: string | null) {
  const existing = await prisma.franchise.findUnique({ where: { tournamentId_name: { tournamentId, name } } });
  if (existing) return existing;
  return prisma.franchise.create({ data: { tournamentId, name, shortName: shortName ?? null } });
}

/**
 * A team renamed mid-season (or between editions) keeps its Franchise: the old
 * name moves into `names` and the franchise takes the new one. If another
 * franchise already owns the new name the franchise is left alone — the Team
 * row's own name still changes, only the history link is skipped.
 */
export async function recordTeamRename(franchiseId: string, oldName: string, newName: string): Promise<void> {
  if (oldName === newName) return;
  const franchise = await prisma.franchise.findUnique({ where: { id: franchiseId } });
  if (!franchise || franchise.name !== oldName) return;
  const taken = await prisma.franchise.findUnique({
    where: { tournamentId_name: { tournamentId: franchise.tournamentId, name: newName } },
  });
  if (taken) return;
  await prisma.franchise.update({
    where: { id: franchiseId },
    data: { name: newName, names: { set: [...franchise.names.filter((n) => n !== oldName), oldName] } },
  });
}
