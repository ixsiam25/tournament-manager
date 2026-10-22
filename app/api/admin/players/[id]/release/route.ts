import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { frozenSeasonResponse } from "@/lib/seasonGuard";
import { seasonInPlay } from "@/lib/rosterRules";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const schema = z.object({ reason: z.string().trim().max(200).optional() });

/** Drops a player from the squad (injury, replacement) WITHOUT deleting them:
 * their goals/assists stay on record, the shirt number is freed, and they can
 * be restored later. */
export async function POST(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;
  const body = schema.safeParse(await request.json().catch(() => ({})));

  const player = await prisma.player.findUnique({ where: { id }, include: { team: { select: { name: true } } } });
  if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const frozen = await frozenSeasonResponse(player.seasonId);
  if (frozen) return frozen;
  if (player.status === "RELEASED") return NextResponse.json({ error: "Already released" }, { status: 409 });
  if (!player.teamId) return NextResponse.json({ error: "This player isn't on a team — delete them or leave them in the pool" }, { status: 409 });

  // Park the shirt number as a negative so the real number is free to reuse
  // while [teamId, jerseyNumber] stays unique for released players too.
  const parked = await prisma.player.count({ where: { teamId: player.teamId, jerseyNumber: { lt: 0 } } });
  const updated = await prisma.player.update({
    where: { id },
    data: { status: "RELEASED", releasedAt: new Date(), jerseyNumber: -(parked + 1), isCaptain: false },
  });

  const inPlay = await seasonInPlay(player.seasonId);
  await logAudit({
    actor,
    action: inPlay ? "roster.transfer" : "roster.release",
    entityType: "Player",
    entityId: id,
    summary: `${inPlay ? "Replacement: " : ""}${player.name} released from ${player.team?.name}${body.success && body.data.reason ? ` — ${body.data.reason}` : ""}`,
    before: { status: player.status, jerseyNumber: player.jerseyNumber, teamId: player.teamId },
    after: { status: updated.status, jerseyNumber: updated.jerseyNumber },
  });
  return NextResponse.json({ player: updated });
}
