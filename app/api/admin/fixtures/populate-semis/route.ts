import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getStandings } from "@/lib/standings";

export const dynamic = "force-dynamic";

/**
 * Fills in the two semifinals from the current league standings — Season IX
 * bracket is 1st vs 4th, 2nd vs 3rd (changed from Season VIII's 1st vs 3rd,
 * 2nd vs 4th). Which SEMIFINAL match becomes SF1 vs SF2 is decided by
 * scheduledAt (SF1 kicks off first); a tournament with more than two
 * semifinal slots, or none, is a setup mistake this refuses to guess at.
 */
export async function POST() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const [standings, teamCount, semis] = await Promise.all([
    getStandings(),
    prisma.team.count(),
    prisma.match.findMany({
      where: { round: "SEMIFINAL" },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const gamesPerTeam = teamCount - 1;
  const notDone = standings.filter((row) => row.played < gamesPerTeam);
  if (notDone.length > 0) {
    return NextResponse.json(
      {
        error: `League isn't finished yet — ${notDone.length} of ${teamCount} teams still have games left.`,
      },
      { status: 409 },
    );
  }

  if (standings.length < 4) {
    return NextResponse.json({ error: "Need at least 4 teams to fill the semifinals." }, { status: 409 });
  }
  if (semis.length !== 2) {
    return NextResponse.json(
      { error: `Expected exactly 2 semifinal fixtures, found ${semis.length}.` },
      { status: 409 },
    );
  }

  const [first, second, third, fourth] = standings;
  const [sf1, sf2] = semis;

  const [updatedSf1, updatedSf2] = await prisma.$transaction([
    prisma.match.update({
      where: { id: sf1.id },
      data: { homeTeamId: first.teamId, awayTeamId: fourth.teamId },
    }),
    prisma.match.update({
      where: { id: sf2.id },
      data: { homeTeamId: second.teamId, awayTeamId: third.teamId },
    }),
  ]);

  await logAudit({
    actor,
    action: "fixture.populate_semis",
    entityType: "Match",
    summary: `Populated semifinals from standings: ${first.teamName} v ${fourth.teamName}, ${second.teamName} v ${third.teamName}`,
  });

  return NextResponse.json({ matches: [updatedSf1, updatedSf2] });
}
