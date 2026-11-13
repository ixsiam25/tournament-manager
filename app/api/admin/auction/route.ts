import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { getTeamAuctionStatuses } from "@/lib/auction";
import { getActiveSeason } from "@/lib/currentSeason";
import { closeChecks, sortQueuedLots } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });

  const settings = await prisma.auctionSettings.findUnique({ where: { seasonId: season.id } });
  if (!settings) {
    return NextResponse.json({ error: "Auction settings haven't been configured for this season yet" }, { status: 409 });
  }

  const playerSelect = { id: true, name: true, position: true, photoUrl: true } as const;
  const [currentLot, queueRaw, unsold, teams, soldCount, checks] = await Promise.all([
    prisma.auctionLot.findFirst({ where: { seasonId: season.id, status: "IN_PROGRESS" }, include: { player: { select: playerSelect } } }),
    prisma.auctionLot.findMany({ where: { seasonId: season.id, status: "QUEUED" }, include: { player: { select: playerSelect } }, orderBy: [{ round: "asc" }, { order: "asc" }] }),
    prisma.auctionLot.findMany({ where: { seasonId: season.id, status: { in: ["UNSOLD", "HELD"] } }, include: { player: { select: playerSelect } }, orderBy: { updatedAt: "asc" } }),
    getTeamAuctionStatuses(season, settings),
    prisma.auctionLot.count({ where: { seasonId: season.id, status: "SOLD" } }),
    closeChecks({ season, settings, actor: null }),
  ]);

  // Each team's squad (with what was paid) for the console's team pop-up.
  const squadPlayers = await prisma.player.findMany({
    where: { seasonId: season.id, teamId: { not: null }, status: "ACTIVE" },
    select: { id: true, name: true, position: true, jerseyNumber: true, isCaptain: true, teamId: true, auctionLot: { select: { status: true, soldPrice: true } } },
    orderBy: { jerseyNumber: "asc" },
  });
  const squads: Record<string, { id: string; name: string; position: string | null; jerseyNumber: number; isCaptain: boolean; price: number | null }[]> = {};
  for (const p of squadPlayers) {
    (squads[p.teamId!] ??= []).push({ id: p.id, name: p.name, position: p.position, jerseyNumber: p.jerseyNumber, isCaptain: p.isCaptain, price: p.auctionLot?.status === "SOLD" ? p.auctionLot.soldPrice : null });
  }

  return NextResponse.json({
    squads,
    season: { id: season.id, name: season.name, teamFormation: season.teamFormation, squadSizeMin: season.squadSizeMin, squadSizeMax: season.squadSizeMax },
    settings,
    currentLot,
    queue: sortQueuedLots(queueRaw),
    unsold,
    unsoldCount: unsold.length,
    soldCount,
    teams,
    closed: !!settings.lockedAt,
    closeBlockers: checks.blockers,
  });
}
