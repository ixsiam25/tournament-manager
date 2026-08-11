import { prisma } from "@/lib/db";

export type RosterPlayer = {
  id: string;
  name: string;
  jerseyNumber: number;
  position: "GK" | "DEF" | "MID" | "FWD" | null;
  isCaptain: boolean;
  photoUrl: string | null;
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  semester: number | null;
};

/** Every player across every team, for the full roster page. Excludes
 * unsold players during an AUCTION season's auction (teamId null) — a
 * "roster" is squad rosters, and an unsold player isn't on a squad yet.
 * Ordering here is just a sane default (semester desc, then team, then
 * squad number) — the page itself re-sorts client-side when the sort
 * button is toggled. */
export async function getAllPlayers(): Promise<RosterPlayer[]> {
  const players = await prisma.player.findMany({
    where: { teamId: { not: null } },
    include: { team: true },
    orderBy: [
      { team: { semester: "desc" } },
      { team: { name: "asc" } },
      { jerseyNumber: "asc" },
    ],
  });

  return players
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
      teamLogoUrl: p.team.logoUrl,
      semester: p.team.semester,
    }));
}
