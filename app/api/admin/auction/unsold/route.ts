import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });

  const lot = await prisma.auctionLot.findFirst({
    where: { seasonId: season.id, status: "IN_PROGRESS" },
    include: { player: true },
  });
  if (!lot) return NextResponse.json({ error: "No lot is currently up for auction" }, { status: 409 });

  const updated = await prisma.auctionLot.update({ where: { id: lot.id }, data: { status: "UNSOLD" } });

  await logAudit({
    actor,
    action: "auction.lot.unsold",
    entityType: "AuctionLot",
    entityId: lot.id,
    summary: `"${lot.player.name}" went unsold`,
  });

  return NextResponse.json({ lot: updated });
}
