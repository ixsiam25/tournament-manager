import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { finishMatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN", "SCORER"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const existing = await prisma.match.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "LIVE") {
    return NextResponse.json({ error: "Match is not live" }, { status: 409 });
  }

  // Regulation score alone can't settle a drawn knockout match — league ties
  // stand as draws, but a SEMIFINAL/FINAL needs someone to actually advance.
  const isKnockout = existing.round !== "LEAGUE";
  const isDraw = existing.homeScore === existing.awayScore;

  const body = isDraw && isKnockout ? await request.json().catch(() => null) : null;
  const parsed = finishMatchSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }
  const { resolution } = parsed.data;

  if (isDraw && isKnockout && !resolution) {
    return NextResponse.json(
      {
        error: "Draw needs a resolution",
        code: "draw_needs_resolution",
        extraTimeAvailable: !existing.extraTimePlayed,
      },
      { status: 409 },
    );
  }

  // Extra time doesn't finish the match — it puts the ball back in play so
  // admin can keep logging goals through the same LIVE events endpoint, and
  // can only be chosen once per match (the client hides the option once
  // extraTimePlayed is set, but this is the actual enforcement).
  if (resolution?.method === "EXTRA_TIME") {
    if (existing.extraTimePlayed) {
      return NextResponse.json({ error: "Extra time has already been played for this match" }, { status: 400 });
    }
    const match = await prisma.match.update({ where: { id }, data: { extraTimePlayed: true } });
    await logAudit({
      actor,
      action: "fixture.extra_time",
      entityType: "Match",
      entityId: match.id,
      summary: "Started extra time",
    });
    return NextResponse.json({ match, stillLive: true });
  }

  let winnerTeamId: string | null = null;
  let penaltyHomeScore: number | null = null;
  let penaltyAwayScore: number | null = null;

  if (resolution?.method === "PENALTIES") {
    if (!existing.homeTeamId || !existing.awayTeamId) {
      return NextResponse.json({ error: "Both teams must be set first" }, { status: 400 });
    }
    if (resolution.penaltyHomeScore === resolution.penaltyAwayScore) {
      return NextResponse.json({ error: "Penalty shootout can't end level" }, { status: 400 });
    }
    penaltyHomeScore = resolution.penaltyHomeScore;
    penaltyAwayScore = resolution.penaltyAwayScore;
    winnerTeamId = penaltyHomeScore > penaltyAwayScore ? existing.homeTeamId : existing.awayTeamId;
  } else if (resolution?.method === "MANUAL") {
    if (resolution.winnerTeamId !== existing.homeTeamId && resolution.winnerTeamId !== existing.awayTeamId) {
      return NextResponse.json({ error: "Winner must be one of the two teams in this match" }, { status: 400 });
    }
    winnerTeamId = resolution.winnerTeamId;
  } else if (isKnockout && !isDraw) {
    // Clear result on a knockout match — record the winner automatically so
    // admin never has to do it by hand for a normal, non-drawn game.
    winnerTeamId = existing.homeScore > existing.awayScore ? existing.homeTeamId : existing.awayTeamId;
  }

  const match = await prisma.match.update({
    where: { id },
    data: {
      status: "FINISHED",
      finishedAt: new Date(),
      winnerTeamId,
      penaltyHomeScore,
      penaltyAwayScore,
    },
  });
  await logAudit({
    actor,
    action: "fixture.finish",
    entityType: "Match",
    entityId: match.id,
    summary: `Finished a ${match.round.toLowerCase()} match ${match.homeScore}-${match.awayScore}${
      resolution ? ` (${resolution.method.toLowerCase()})` : ""
    }`,
  });
  return NextResponse.json({ match });
}
