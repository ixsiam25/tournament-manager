import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Requeues every UNSOLD lot as a new round, for a second pass once the
 * first pass through the queue is done. */
export async function POST() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });

  const unsold = await prisma.auctionLot.findMany({ where: { seasonId: season.id, status: "UNSOLD" } });
  if (unsold.length === 0) {
    return NextResponse.json({ error: "No unsold lots to requeue" }, { status: 409 });
  }

  const nextRound = Math.max(...unsold.map((l) => l.round)) + 1;
  await prisma.$transaction(
    unsold.map((lot, i) =>
      prisma.auctionLot.update({
        where: { id: lot.id },
        data: { status: "QUEUED", round: nextRound, order: i },
      }),
    ),
  );

  await logAudit({
    actor,
    action: "auction.requeue_unsold",
    entityType: "AuctionLot",
    summary: `Requeued ${unsold.length} unsold lot(s) for round ${nextRound}`,
  });

  return NextResponse.json({ count: unsold.length });
}
