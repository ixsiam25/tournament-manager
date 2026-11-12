import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getActiveSeason } from "@/lib/currentSeason";
import { approveRegistration } from "@/lib/registrationApproval";
import { findMissingPlayers } from "@/lib/missingPlayers";

export const dynamic = "force-dynamic";

/** Brings back players that are approved but missing from the season — back in the pool, and in the auction queue for an auction. */
export async function POST() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });

  const missing = await findMissingPlayers(season.id);
  let restored = 0;
  for (const reg of missing) {
    const r = await approveRegistration(reg, season);
    if (r.createdPlayer) restored++;
  }
  await logAudit({ actor, action: "roster.restore_missing", entityType: "Season", entityId: season.id, summary: `Restored ${restored} approved player(s) that were missing from the season` });
  return NextResponse.json({ restored });
}
