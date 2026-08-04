import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getChampionTally } from "@/lib/predictions";
import { championPredictionSchema } from "@/lib/validation";
import { isChampionPredictionOpen } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const voterId = request.nextUrl.searchParams.get("voterId");
  const [tally, open] = await Promise.all([getChampionTally(voterId), isChampionPredictionOpen()]);
  return NextResponse.json({ ...tally, open });
}

export async function POST(request: NextRequest) {
  const open = await isChampionPredictionOpen();
  if (!open) {
    return NextResponse.json({ error: "Champion predictions are closed." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = championPredictionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { teamId, voterId, voterName, voterSemester } = parsed.data;

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  await prisma.championPrediction.upsert({
    where: { voterId },
    create: {
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

  const tally = await getChampionTally(voterId);
  return NextResponse.json({ ...tally, open: true });
}
