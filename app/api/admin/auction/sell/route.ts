import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getTeamAuctionStatuses } from "@/lib/auction";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  teamId: z.string().trim().min(1),
  price: z.coerce.number().int().positive(),
});

export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });
  const settings = await prisma.auctionSettings.findUnique({ where: { seasonId: season.id } });
  if (!settings) return NextResponse.json({ error: "Auction settings not configured" }, { status: 409 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }
  const { teamId, price } = parsed.data;

  const lot = await prisma.auctionLot.findFirst({
    where: { seasonId: season.id, status: "IN_PROGRESS" },
    include: { player: true },
  });
  if (!lot) return NextResponse.json({ error: "No lot is currently up for auction" }, { status: 409 });

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  if (price < settings.basePrice) {
    return NextResponse.json({ error: `Price must be at least the base price (${settings.basePrice})` }, { status: 400 });
  }

  const statuses = await getTeamAuctionStatuses(season, settings);
  const teamStatus = statuses.find((t) => t.teamId === teamId)!;
  if (price > teamStatus.maxAllowableBid) {
    return NextResponse.json(
      { error: `Price exceeds ${team.name}'s max allowable bid (${teamStatus.maxAllowableBid}, reserving budget to fill a legal squad)` },
      { status: 400 },
    );
  }
  if (teamStatus.squadCount >= season.squadSizeMax!) {
    return NextResponse.json({ error: `${team.name}'s squad is already at the max size` }, { status: 400 });
  }

  const maxJersey = await prisma.player.aggregate({ where: { teamId }, _max: { jerseyNumber: true } });
  const jerseyNumber = (maxJersey._max.jerseyNumber ?? 0) + 1;

  const [updatedLot] = await prisma.$transaction([
    prisma.auctionLot.update({
      where: { id: lot.id },
      data: { status: "SOLD", soldToTeamId: teamId, soldPrice: price, soldAt: new Date(), soldByUserId: actor.id },
    }),
    prisma.player.update({ where: { id: lot.playerId }, data: { teamId, jerseyNumber } }),
  ]);

  await logAudit({
    actor,
    action: "auction.lot.sell",
    entityType: "AuctionLot",
    entityId: lot.id,
    summary: `Sold "${lot.player.name}" to "${team.name}" for ${price}`,
  });

  return NextResponse.json({ lot: updatedLot });
}
