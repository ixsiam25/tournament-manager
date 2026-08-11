import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN", "SCORER"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;

  const match = await prisma.match.findUnique({ where: { id } });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const latest = await prisma.matchEvent.findFirst({
    where: { matchId: id },
    orderBy: { sequence: "desc" },
  });
  if (!latest) return NextResponse.json({ error: "No events to undo" }, { status: 404 });

  const group = await prisma.matchEvent.findMany({ where: { matchId: id, groupId: latest.groupId } });
  const homeGoals = group.filter((e) => e.type === "GOAL" && e.teamId === match.homeTeamId).length;
  const awayGoals = group.filter((e) => e.type === "GOAL" && e.teamId === match.awayTeamId).length;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.matchEvent.deleteMany({ where: { matchId: id, groupId: latest.groupId } });
    return tx.match.update({
      where: { id },
      data: {
        homeScore: { decrement: homeGoals },
        awayScore: { decrement: awayGoals },
      },
    });
  });

  await logAudit({
    actor,
    action: "fixture.event.undo",
    entityType: "Match",
    entityId: id,
    summary: `Undid the last logged event (${group.length} row(s))`,
    before: group,
  });

  return NextResponse.json({ match: updated });
}
