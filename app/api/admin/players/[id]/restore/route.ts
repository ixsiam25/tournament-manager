import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { frozenSeasonResponse } from "@/lib/seasonGuard";
import { nextFreeJersey } from "@/lib/rosterRules";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Brings a released player back into their squad (subject to squad size). */
export async function POST(_request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;

  const player = await prisma.player.findUnique({ where: { id }, include: { season: true, team: { select: { name: true } } } });
  if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const frozen = await frozenSeasonResponse(player.seasonId);
  if (frozen) return frozen;
  if (player.status !== "RELEASED" || !player.teamId) return NextResponse.json({ error: "That player isn't released" }, { status: 409 });

  const max = player.season.squadSizeMax;
  if (max && (await prisma.player.count({ where: { teamId: player.teamId, status: "ACTIVE" } })) >= max) {
    return NextResponse.json({ error: `${player.team?.name} already has the maximum of ${max} players` }, { status: 409 });
  }
  const updated = await prisma.player.update({
    where: { id },
    data: { status: "ACTIVE", releasedAt: null, jerseyNumber: await nextFreeJersey(player.teamId) },
  });
  await logAudit({
    actor,
    action: "roster.restore",
    entityType: "Player",
    entityId: id,
    summary: `${player.name} restored to ${player.team?.name} (#${updated.jerseyNumber})`,
  });
  return NextResponse.json({ player: updated });
}
