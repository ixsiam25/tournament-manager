import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/requireAdmin";
import { finishMatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

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
      { error: "Draw needs a resolution", code: "draw_needs_resolution" },
      { status: 409 },
    );
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
  return NextResponse.json({ match });
}
