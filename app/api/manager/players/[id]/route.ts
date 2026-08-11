import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { managerPlayerPositionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Lets a manager move one of their own players between positions on the
 * pitch formation — nothing else about the player is editable here. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const result = await requireUser(["OWNER"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const teamId = actor.teamId!;

  const { id: playerId } = await params;
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  if (player.teamId !== teamId) {
    return NextResponse.json({ error: "That player isn't on your team" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = managerPlayerPositionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const updated = await prisma.player.update({
    where: { id: playerId },
    data: { position: parsed.data.position },
  });
  await logAudit({
    actor,
    action: "player.position.update",
    entityType: "Player",
    entityId: playerId,
    summary: `Manager set ${player.name}'s position to ${parsed.data.position ?? "unassigned"}`,
    before: { position: player.position },
    after: { position: updated.position },
  });
  return NextResponse.json({ player: updated });
}
