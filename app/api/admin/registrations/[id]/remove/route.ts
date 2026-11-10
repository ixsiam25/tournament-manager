import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getActiveSeason } from "@/lib/currentSeason";
import { seasonInPlay } from "@/lib/rosterRules";
import { REMOVED_PREFIX } from "@/lib/registrationRemoval";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const schema = z.object({ reason: z.string().trim().max(200).optional() });

/**
 * Takes a player out of the season (injury, withdrawal) — works at any stage, including
 * players still waiting in the pool, who can't be "released" from a team because they have none.
 * The application becomes REJECTED with a "Removed by admin" note, so the place is freed
 * for the application limit; nothing is deleted, and it can be reinstated (DELETE).
 */
export async function POST(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;
  const body = schema.safeParse(await request.json().catch(() => ({})));
  const reason = body.success ? body.data.reason : undefined;

  const reg = await prisma.registration.findUnique({ where: { id } });
  if (!reg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const season = await getActiveSeason();
  if (!season || season.id !== reg.seasonId) return NextResponse.json({ error: "This season is closed — its players can't be changed" }, { status: 409 });
  if (reg.status !== "APPROVED") return NextResponse.json({ error: "Only approved players can be removed — reject pending applications instead" }, { status: 409 });

  const player = reg.personId ? await prisma.player.findUnique({ where: { seasonId_personId: { seasonId: reg.seasonId, personId: reg.personId } } }) : null;
  if (player) {
    const lot = await prisma.auctionLot.findUnique({ where: { playerId: player.id } });
    if (lot?.status === "IN_PROGRESS") return NextResponse.json({ error: "This player is being auctioned right now — finish or mark that lot unsold first" }, { status: 409 });

    if (player.teamId) {
      // On a squad: release like the roster manager does (goals/assists stay on record, the shirt number is freed).
      const parked = await prisma.player.count({ where: { teamId: player.teamId, jerseyNumber: { lt: 0 } } });
      await prisma.player.update({ where: { id: player.id }, data: { status: "RELEASED", releasedAt: new Date(), jerseyNumber: -(parked + 1), isCaptain: false } });
    } else {
      // Still in the pool: out of the pool and out of the auction queue.
      await prisma.player.update({ where: { id: player.id }, data: { status: "RELEASED", releasedAt: new Date(), isCaptain: false } });
      if (lot && ["QUEUED", "UNSOLD", "HELD"].includes(lot.status)) await prisma.auctionLot.delete({ where: { id: lot.id } });
    }
  }
  const note = `${REMOVED_PREFIX}${reason ? `: ${reason}` : ""}`;
  await prisma.registration.update({ where: { id }, data: { status: "REJECTED", notes: note, reviewedByUserId: actor.id } });
  const inPlay = await seasonInPlay(reg.seasonId);
  await logAudit({ actor, action: inPlay ? "roster.transfer" : "registration.remove", entityType: "Registration", entityId: id, summary: `Removed ${reg.name} from the season${reason ? ` — ${reason}` : ""}` });
  return NextResponse.json({ ok: true });
}

/** Undo a removal: the application is approved again and a pool player comes back (queued for the auction if it is one). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;

  const reg = await prisma.registration.findUnique({ where: { id } });
  if (!reg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const season = await getActiveSeason();
  if (!season || season.id !== reg.seasonId) return NextResponse.json({ error: "This season is closed — its players can't be changed" }, { status: 409 });
  if (reg.status !== "REJECTED" || !reg.notes?.startsWith(REMOVED_PREFIX)) return NextResponse.json({ error: "This application wasn't removed by an admin" }, { status: 409 });

  const player = reg.personId ? await prisma.player.findUnique({ where: { seasonId_personId: { seasonId: reg.seasonId, personId: reg.personId } } }) : null;
  if (player?.teamId) return NextResponse.json({ error: "They were on a team — restore them from the Players page so they return to that squad" }, { status: 409 });
  if (player) {
    await prisma.player.update({ where: { id: player.id }, data: { status: "ACTIVE", releasedAt: null } });
    if (season.teamFormation === "AUCTION" && !(await prisma.auctionLot.findUnique({ where: { playerId: player.id } }))) {
      const max = await prisma.auctionLot.aggregate({ where: { seasonId: season.id }, _max: { order: true } });
      await prisma.auctionLot.create({ data: { seasonId: season.id, playerId: player.id, order: (max._max.order ?? -1) + 1, status: "QUEUED" } });
    }
  }
  await prisma.registration.update({ where: { id }, data: { status: "APPROVED", notes: null, reviewedByUserId: actor.id } });
  await logAudit({ actor, action: "registration.reinstate", entityType: "Registration", entityId: id, summary: `Reinstated ${reg.name}` });
  return NextResponse.json({ ok: true });
}
