import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Reverts the most recently resolved lot (sold or unsold) back to
 * QUEUED — if it was sold, un-assigns the player from the team too.
 * Password-gated client-side, same as undoing a live match event. */
export async function POST() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });

  const lot = await prisma.auctionLot.findFirst({
    where: { seasonId: season.id, status: { in: ["SOLD", "UNSOLD"] } },
    orderBy: { updatedAt: "desc" },
    include: { player: true, soldToTeam: true },
  });
  if (!lot) return NextResponse.json({ error: "Nothing to undo" }, { status: 409 });

  const wasSold = lot.status === "SOLD";

  await prisma.$transaction([
    prisma.auctionLot.update({
      where: { id: lot.id },
      data: { status: "QUEUED", soldToTeamId: null, soldPrice: null, soldAt: null, soldByUserId: null },
    }),
    ...(wasSold ? [prisma.player.update({ where: { id: lot.playerId }, data: { teamId: null, jerseyNumber: 0 } })] : []),
  ]);

  await logAudit({
    actor,
    action: "auction.lot.undo",
    entityType: "AuctionLot",
    entityId: lot.id,
    summary: `Undid ${wasSold ? `sale of "${lot.player.name}" to "${lot.soldToTeam?.name}"` : `"${lot.player.name}" going unsold`}`,
  });

  return NextResponse.json({ ok: true });
}
