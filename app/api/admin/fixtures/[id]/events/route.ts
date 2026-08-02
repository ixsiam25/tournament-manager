import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { eventSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }
  const { type, teamId, playerId, assistPlayerId } = parsed.data;

  const match = await prisma.match.findUnique({ where: { id } });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (match.status !== "LIVE") {
    return NextResponse.json({ error: "Match is not live" }, { status: 409 });
  }
  if (teamId !== match.homeTeamId && teamId !== match.awayTeamId) {
    return NextResponse.json({ error: "Team is not part of this match" }, { status: 400 });
  }

  const groupId = randomUUID();
  const isHome = teamId === match.homeTeamId;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.matchEvent.create({
      data: { matchId: id, type, teamId, playerId, groupId },
    });
    if (type === "GOAL" && assistPlayerId) {
      await tx.matchEvent.create({
        data: { matchId: id, type: "ASSIST", teamId, playerId: assistPlayerId, groupId },
      });
    }
    if (type !== "GOAL") return match;
    return tx.match.update({
      where: { id },
      data: isHome ? { homeScore: { increment: 1 } } : { awayScore: { increment: 1 } },
    });
  });

  return NextResponse.json({ match: updated }, { status: 201 });
}

/**
 * Full reset — clears every logged event, zeroes the score, and puts the
 * match back to SCHEDULED (clearing startedAt/finishedAt too) as if it had
 * never been started. Distinct from DELETE /events/latest (undo one event):
 * this is for redoing a match from scratch, e.g. the wrong fixture was
 * started live by accident, or it was finished before it should have been.
 * Gated client-side by the same admin-password re-entry as other
 * destructive actions (delete fixture, undo last event).
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const match = await prisma.match.findUnique({ where: { id } });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.matchEvent.deleteMany({ where: { matchId: id } });
    return tx.match.update({
      where: { id },
      data: {
        homeScore: 0,
        awayScore: 0,
        status: "SCHEDULED",
        startedAt: null,
        finishedAt: null,
      },
    });
  });

  return NextResponse.json({ match: updated });
}
