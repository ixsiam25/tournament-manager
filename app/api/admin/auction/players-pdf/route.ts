import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { getActiveSeason } from "@/lib/currentSeason";
import { getCards } from "@/lib/cardData";
import { buildAuctionPlayersPdf } from "@/lib/auctionPlayersPdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The handout for team managers and captains: every player still available for bidding, with pictures, as a PDF. */
export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });
  const settings = await prisma.auctionSettings.findUnique({ where: { seasonId: season.id } });
  if (!settings) return NextResponse.json({ error: "Auction settings haven't been configured yet" }, { status: 409 });

  const lots = await prisma.auctionLot.findMany({ where: { seasonId: season.id, status: { in: ["QUEUED", "UNSOLD", "HELD", "IN_PROGRESS"] } }, select: { playerId: true } });
  const cards = await getCards(season.id, { includePool: true, playerIds: lots.map((l) => l.playerId) });
  const captainRows = await prisma.player.findMany({ where: { seasonId: season.id, isCaptain: true, teamId: { not: null }, status: "ACTIVE" }, select: { name: true, team: { select: { name: true } } } });

  const bytes = await buildAuctionPlayersPdf({
    seasonName: season.name,
    players: cards.map((c) => ({ name: c.name, position: c.position, semester: c.semester, imageUrl: c.photoSrc ?? c.imageUrl })),
    captains: captainRows.map((c) => ({ team: c.team?.name ?? "", name: c.name })).sort((a, b) => a.team.localeCompare(b.team)),
    rules: { basePrice: settings.basePrice, bidIncrement: settings.bidIncrement, budgetPerTeam: settings.budgetPerTeam },
  });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="bfl-auction-players-${season.slug}-${date}.pdf"` },
  });
}
