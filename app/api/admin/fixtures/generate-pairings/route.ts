import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { generateRoundRobinPairs, generateDoubleRoundRobinPairs } from "@/lib/roundRobin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  teamIds: z.array(z.string()).min(2, "Need at least 2 teams"),
  double: z.boolean().optional(),
});

/** Bulk-creates LEAGUE fixtures with both teams assigned but no
 * scheduledAt/venue — pure combinatorics (see `lib/roundRobin.ts`), not the
 * scheduling assistant. Refuses if any LEAGUE fixture already exists, so it
 * can't silently double up a league that was partly hand-built already. */
export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const existingLeagueCount = await prisma.match.count({ where: { round: "LEAGUE" } });
  if (existingLeagueCount > 0) {
    return NextResponse.json(
      { error: `${existingLeagueCount} league fixture(s) already exist — delete them first if you want to regenerate.` },
      { status: 409 },
    );
  }

  const teams = await prisma.team.findMany({ where: { id: { in: parsed.data.teamIds } } });
  if (teams.length !== parsed.data.teamIds.length) {
    return NextResponse.json({ error: "One or more teams not found" }, { status: 400 });
  }

  const pairs = parsed.data.double
    ? generateDoubleRoundRobinPairs(parsed.data.teamIds)
    : generateRoundRobinPairs(parsed.data.teamIds);

  const created = await prisma.$transaction(
    pairs.map(([homeTeamId, awayTeamId], i) =>
      prisma.match.create({
        data: { round: "LEAGUE", homeTeamId, awayTeamId, label: `Match ${i + 1}` },
      }),
    ),
  );

  await logAudit({
    actor,
    action: "fixture.generate_pairings",
    entityType: "Match",
    summary: `Generated ${created.length} ${parsed.data.double ? "double" : "single"} round-robin fixtures for ${teams.length} teams`,
  });

  return NextResponse.json({ count: created.length }, { status: 201 });
}
