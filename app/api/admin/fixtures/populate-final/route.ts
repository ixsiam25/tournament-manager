import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getActiveSeason } from "@/lib/currentSeason";
import { frozenSeasonResponse } from "@/lib/seasonGuard";

export const dynamic = "force-dynamic";

/** Fills the Final from the two semifinal winners (Semifinal 1's winner is home). Needs both semis finished. */
export async function POST() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });
  const frozen = await frozenSeasonResponse(season.id);
  if (frozen) return frozen;

  const [semis, finals] = await Promise.all([
    prisma.match.findMany({ where: { seasonId: season.id, round: "SEMIFINAL" }, orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }] }),
    prisma.match.findMany({ where: { seasonId: season.id, round: "FINAL" } }),
  ]);
  if (semis.length !== 2) return NextResponse.json({ error: `Expected exactly 2 semifinal fixtures, found ${semis.length}.` }, { status: 409 });
  if (finals.length !== 1) return NextResponse.json({ error: `Expected exactly 1 final fixture, found ${finals.length}.` }, { status: 409 });
  const unfinished = semis.filter((m) => m.status !== "FINISHED" || !m.winnerTeamId);
  if (unfinished.length > 0) return NextResponse.json({ error: `${unfinished.length} semifinal(s) aren't finished yet.` }, { status: 409 });
  if (finals[0].status !== "SCHEDULED") return NextResponse.json({ error: "The final has already started." }, { status: 409 });

  const final = await prisma.match.update({ where: { id: finals[0].id }, data: { homeTeamId: semis[0].winnerTeamId, awayTeamId: semis[1].winnerTeamId } });
  await logAudit({ actor: result.user, action: "fixture.populate_final", entityType: "Match", entityId: final.id, summary: "Filled the final from the semifinal winners" });
  return NextResponse.json({ match: final });
}
