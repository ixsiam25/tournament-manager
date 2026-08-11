import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { getTeamAuctionStatuses } from "@/lib/auction";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });

  const settings = await prisma.auctionSettings.findUnique({ where: { seasonId: season.id } });
  if (!settings) {
    return NextResponse.json({ error: "Auction settings haven't been configured for this season yet" }, { status: 409 });
  }

  const [currentLot, queue, teams] = await Promise.all([
    prisma.auctionLot.findFirst({
      where: { seasonId: season.id, status: "IN_PROGRESS" },
      include: { player: { include: { person: true } } },
    }),
    prisma.auctionLot.findMany({
      where: { seasonId: season.id, status: "QUEUED" },
      include: { player: true },
      orderBy: [{ round: "asc" }, { order: "asc" }],
    }),
    getTeamAuctionStatuses(season, settings),
  ]);

  const unsoldCount = await prisma.auctionLot.count({ where: { seasonId: season.id, status: "UNSOLD" } });
  const soldCount = await prisma.auctionLot.count({ where: { seasonId: season.id, status: "SOLD" } });

  return NextResponse.json({ season, settings, currentLot, queue, teams, unsoldCount, soldCount });
}
