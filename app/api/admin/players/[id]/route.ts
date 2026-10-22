import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { playerSchema } from "@/lib/validation";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { frozenSeasonResponse } from "@/lib/seasonGuard";
import { FormationError, movePlayer } from "@/lib/formationService";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Edit any roster fact: name, jersey, team (a move/transfer), position,
 * captaincy, photo. Moves go through the formation service so squad size,
 * jersey assignment and transfer flagging behave the same everywhere. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const parsed = playerSchema.omit({ studentId: true }).partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const before = await prisma.player.findUnique({ where: { id }, include: { season: true } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const frozen = await frozenSeasonResponse(before.seasonId);
  if (frozen) return frozen;
  const { teamId, jerseyNumber, isCaptain, ...simple } = parsed.data;

  if (before.status === "RELEASED" && (teamId !== undefined || jerseyNumber !== undefined || isCaptain)) {
    return NextResponse.json({ error: "Restore this player before changing their team, number or captaincy" }, { status: 409 });
  }

  try {
    if (teamId !== undefined && teamId !== before.teamId) {
      await movePlayer({ season: before.season, playerId: id, teamId, actor });
    }
    const current = (await prisma.player.findUnique({ where: { id } }))!;

    if (jerseyNumber !== undefined && current.teamId && jerseyNumber !== current.jerseyNumber) {
      const holder = await prisma.player.findFirst({
        where: { teamId: current.teamId, jerseyNumber, status: "ACTIVE", id: { not: id } },
        select: { name: true },
      });
      if (holder) throw new FormationError(`Jersey #${jerseyNumber} is already worn by ${holder.name}`);
    }

    const ops = [];
    if (isCaptain && current.teamId) {
      ops.push(prisma.player.updateMany({ where: { teamId: current.teamId, isCaptain: true, id: { not: id } }, data: { isCaptain: false } }));
    }
    ops.push(
      prisma.player.update({
        where: { id },
        data: {
          ...simple,
          ...(jerseyNumber !== undefined && current.teamId ? { jerseyNumber } : {}),
          ...(isCaptain !== undefined ? { isCaptain: isCaptain && !!current.teamId } : {}),
        },
      }),
    );
    const results = await prisma.$transaction(ops);
    const player = results[results.length - 1] as typeof current;

    const changed = Object.keys({ ...simple, ...(jerseyNumber !== undefined ? { jerseyNumber } : {}), ...(isCaptain !== undefined ? { isCaptain } : {}) });
    if (changed.length > 0) {
      await logAudit({
        actor,
        action: "player.update",
        entityType: "Player",
        entityId: player.id,
        summary: `Updated player "${player.name}" (${changed.join(", ")})`,
        before: { name: before.name, jerseyNumber: before.jerseyNumber, position: before.position, isCaptain: before.isCaptain, photoUrl: before.photoUrl },
        after: { name: player.name, jerseyNumber: player.jerseyNumber, position: player.position, isCaptain: player.isCaptain, photoUrl: player.photoUrl },
      });
    }
    return NextResponse.json({ player });
  } catch (e) {
    if (e instanceof FormationError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not save that change" }, { status: 409 });
  }
}

/** Deletes a player with no match history. Anyone with goals/assists/cards on
 * record must be released instead, so past results never lose their scorer. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const before = await prisma.player.findUnique({ where: { id } });
  const frozen = await frozenSeasonResponse(before?.seasonId);
  if (frozen) return frozen;
  const events = await prisma.matchEvent.count({ where: { playerId: id } });
  if (events > 0) {
    return NextResponse.json(
      { error: `${before?.name ?? "This player"} has ${events} match event(s) on record — release them from the squad instead of deleting.` },
      { status: 409 },
    );
  }
  await prisma.player.delete({ where: { id } });
  await logAudit({
    actor,
    action: "player.delete",
    entityType: "Player",
    entityId: id,
    summary: `Deleted player "${before?.name ?? id}"`,
    before,
  });
  return NextResponse.json({ ok: true });
}
