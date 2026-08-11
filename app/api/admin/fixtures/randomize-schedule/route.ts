import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { randomizeSchedule, computeMinRestGap, formatHHMM } from "@/lib/scheduleRandomizer";
import type { SeasonFormatConfig } from "@/lib/seasonFormat";

export const dynamic = "force-dynamic";

/**
 * POST with no body (or `{}`) previews a proposed schedule without writing
 * anything. POST with `{ apply: true, assignments: [...] }` (the exact
 * preview payload echoed back) commits it — only ever touching LEAGUE
 * matches that still have no `scheduledAt`, so a manually-scheduled
 * knockout fixture is never at risk.
 */
export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });
  if (!season.formatConfig) {
    return NextResponse.json(
      { error: "This season has no format configured yet — set pitches, match duration, etc. in Settings first." },
      { status: 409 },
    );
  }
  const config = season.formatConfig as unknown as SeasonFormatConfig;

  const unscheduled = await prisma.match.findMany({
    where: { round: "LEAGUE", scheduledAt: null, homeTeamId: { not: null }, awayTeamId: { not: null } },
    include: { homeTeam: true, awayTeam: true },
  });
  if (unscheduled.length === 0) {
    return NextResponse.json({ error: "No unscheduled league fixtures to randomize" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const apply = body?.apply === true;

  if (!apply) {
    const scheduled = randomizeSchedule(
      unscheduled.map((m) => ({ id: m.id, homeTeamId: m.homeTeamId!, awayTeamId: m.awayTeamId! })),
      config,
    );
    const worstRestMinutes = computeMinRestGap(scheduled, config.matchDurationMinutes);
    const preview = scheduled
      .map((s) => {
        const match = unscheduled.find((m) => m.id === s.id)!;
        return {
          matchId: s.id,
          homeTeamName: match.homeTeam!.name,
          awayTeamName: match.awayTeam!.name,
          pitch: s.pitch,
          time: formatHHMM(s.startMinutes),
          startMinutes: s.startMinutes,
        };
      })
      .sort((a, b) => a.startMinutes - b.startMinutes);
    return NextResponse.json({ preview, worstRestMinutes });
  }

  // Apply: only ever the matches this route itself found unscheduled —
  // re-derive server-side rather than trusting whatever the client posts
  // back, so a stale preview can't accidentally schedule something twice.
  const scheduled = randomizeSchedule(
    unscheduled.map((m) => ({ id: m.id, homeTeamId: m.homeTeamId!, awayTeamId: m.awayTeamId! })),
    config,
  );
  const today = new Date();
  const scheduledAtFor = (startMinutes: number) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    // Interpret startMinutes as Asia/Tokyo local time, then convert to UTC
    // for storage — 9h ahead of UTC, no DST.
    d.setUTCMinutes(d.getUTCMinutes() + startMinutes - 9 * 60);
    return d;
  };

  await prisma.$transaction(
    scheduled.map((s) =>
      prisma.match.update({
        where: { id: s.id },
        data: { scheduledAt: scheduledAtFor(s.startMinutes), venue: s.pitch },
      }),
    ),
  );

  await logAudit({
    actor,
    action: "fixture.randomize_schedule",
    entityType: "Match",
    summary: `Randomized kickoff times for ${scheduled.length} league fixtures (worst-case rest: ${computeMinRestGap(scheduled, config.matchDurationMinutes)} min)`,
  });

  return NextResponse.json({ ok: true, count: scheduled.length });
}
