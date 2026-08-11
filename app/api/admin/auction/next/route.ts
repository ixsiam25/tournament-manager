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

  const inProgress = await prisma.auctionLot.findFirst({ where: { seasonId: season.id, status: "IN_PROGRESS" } });
  if (inProgress) {
    return NextResponse.json({ error: "Resolve the current lot (sold/unsold) before moving on" }, { status: 409 });
  }

  const next = await prisma.auctionLot.findFirst({
    where: { seasonId: season.id, status: "QUEUED" },
    orderBy: [{ round: "asc" }, { order: "asc" }],
    include: { player: true },
  });
  if (!next) {
    return NextResponse.json({ error: "No lots left in the queue" }, { status: 409 });
  }

  const lot = await prisma.auctionLot.update({
    where: { id: next.id },
    data: { status: "IN_PROGRESS" },
    include: { player: { include: { person: true } } },
  });

  await logAudit({
    actor,
    action: "auction.lot.next",
    entityType: "AuctionLot",
    entityId: lot.id,
    summary: `Brought up "${lot.player.name}" for auction`,
  });

  return NextResponse.json({ lot });
}
