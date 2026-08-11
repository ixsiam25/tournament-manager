import { prisma } from "@/lib/db";
import type { AuctionSettings, Season } from "@/lib/generated/prisma/client";

export type PublicAuctionStatus =
  | { active: false }
  | {
      active: true;
      seasonName: string;
      currentLot: {
        playerName: string;
        position: string | null;
        photoUrl: string | null;
        basePrice: number;
      } | null;
      teams: { teamName: string; logoUrl: string | null; remainingBudget: number; squadCount: number }[];
      soldCount: number;
      queuedCount: number;
    };

/** Public read-only view — current lot + team budgets, no admin data.
 * Shared by the server-rendered `/auction` page (for a flash-free initial
 * paint) and the `/api/public/auction` route it polls afterward, same
 * pattern as `lib/liveStatus.ts` / `/api/public/live`. */
export async function getPublicAuctionStatus(): Promise<PublicAuctionStatus> {
  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season || season.teamFormation !== "AUCTION") return { active: false };

  const settings = await prisma.auctionSettings.findUnique({ where: { seasonId: season.id } });
  if (!settings) return { active: false };

  const [currentLot, teams, soldCount, queuedCount] = await Promise.all([
    prisma.auctionLot.findFirst({
      where: { seasonId: season.id, status: "IN_PROGRESS" },
      include: { player: true },
    }),
    getTeamAuctionStatuses(season, settings),
    prisma.auctionLot.count({ where: { seasonId: season.id, status: "SOLD" } }),
    prisma.auctionLot.count({ where: { seasonId: season.id, status: "QUEUED" } }),
  ]);

  return {
    active: true,
    seasonName: season.name,
    currentLot: currentLot
      ? {
          playerName: currentLot.player.name,
          position: currentLot.player.position,
          photoUrl: currentLot.player.photoUrl,
          basePrice: settings.basePrice,
        }
      : null,
    teams: teams.map((t) => ({
      teamName: t.teamName,
      logoUrl: t.logoUrl,
      remainingBudget: t.remainingBudget,
      squadCount: t.squadCount,
    })),
    soldCount,
    queuedCount,
  };
}

export type TeamAuctionStatus = {
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  squadCount: number;
  remainingBudget: number;
  maxAllowableBid: number;
};

/** Everything derived on read, matching the existing convention in
 * `lib/standings.ts`/`lib/playerStats.ts` — no `budgetSpent` column to
 * drift out of sync with the actual sold lots. */
export async function getTeamAuctionStatuses(
  season: Season,
  settings: AuctionSettings,
): Promise<TeamAuctionStatus[]> {
  const [teams, soldLots] = await Promise.all([
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.auctionLot.findMany({ where: { seasonId: season.id, status: "SOLD" } }),
  ]);

  return teams.map((team) => {
    const teamLots = soldLots.filter((l) => l.soldToTeamId === team.id);
    const spent = teamLots.reduce((sum, l) => sum + (l.soldPrice ?? 0), 0);
    const remainingBudget = settings.budgetPerTeam - spent;
    const squadCount = teamLots.length;
    // Standard auction rule: leave enough budget to fill the rest of a
    // legal squad at base price each, so an owner can never bid themselves
    // into an under-strength squad.
    const slotsStillNeeded = Math.max(0, season.squadSizeMin! - squadCount - 1);
    const maxAllowableBid = Math.max(0, remainingBudget - slotsStillNeeded * settings.basePrice);

    return {
      teamId: team.id,
      teamName: team.name,
      logoUrl: team.logoUrl,
      squadCount,
      remainingBudget,
      maxAllowableBid,
    };
  });
}
