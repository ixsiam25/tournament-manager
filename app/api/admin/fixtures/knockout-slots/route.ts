import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getActiveSeason } from "@/lib/currentSeason";
import { frozenSeasonResponse } from "@/lib/seasonGuard";
import { ensureKnockoutSlots } from "@/lib/knockoutSlots";

export const dynamic = "force-dynamic";

/** Adds the empty semifinal + final fixtures to a season that has a league but no knockout rounds yet. */
export async function POST() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });
  const frozen = await frozenSeasonResponse(season.id);
  if (frozen) return frozen;

  const count = await ensureKnockoutSlots(season.id);
  if (count === 0) return NextResponse.json({ error: "The knockout fixtures already exist (or this season has no knockout rounds)." }, { status: 409 });
  await logAudit({ actor: result.user, action: "fixture.knockout_slots", entityType: "Match", summary: `Added ${count} knockout fixture(s)` });
  return NextResponse.json({ count }, { status: 201 });
}
