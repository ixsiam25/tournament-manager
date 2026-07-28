import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPredictionTally } from "@/lib/predictions";
import { predictionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const matchId = request.nextUrl.searchParams.get("matchId");
  const voterId = request.nextUrl.searchParams.get("voterId");
  if (!matchId) {
    return NextResponse.json({ error: "matchId is required" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { homeTeamId: true, awayTeamId: true },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const tally = await getPredictionTally(matchId, match.homeTeamId, match.awayTeamId, voterId);
  return NextResponse.json(tally);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = predictionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { matchId, teamId, voterId, voterName, voterSemester } = parsed.data;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { status: true, homeTeamId: true, awayTeamId: true },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.status === "FINISHED") {
    return NextResponse.json({ error: "Voting is closed for this match" }, { status: 400 });
  }
  if (teamId !== match.homeTeamId && teamId !== match.awayTeamId) {
    return NextResponse.json({ error: "That team isn't playing in this match" }, { status: 400 });
  }

  await prisma.prediction.upsert({
    where: { matchId_voterId: { matchId, voterId } },
    create: {
      matchId,
      teamId,
      voterId,
      voterName: voterName || null,
      voterSemester: voterSemester || null,
    },
    update: {
      teamId,
      voterName: voterName || null,
      voterSemester: voterSemester || null,
    },
  });

  const tally = await getPredictionTally(matchId, match.homeTeamId, match.awayTeamId, voterId);
  return NextResponse.json(tally);
}
