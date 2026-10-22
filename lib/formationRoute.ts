import { NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/userAuth";
import { getActiveSeason } from "@/lib/currentSeason";
import { FormationError } from "@/lib/formationService";
import type { Season } from "@/lib/generated/prisma/client";

/** Shared wrapper for the mutating formation endpoints: ADMIN only, an ACTIVE
 * season, and friendly errors from the service layer. */
export async function formationAction(
  run: (ctx: { season: Season; actor: AuthedUser }) => Promise<unknown>,
): Promise<NextResponse> {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season — frozen seasons can't be changed" }, { status: 409 });
  try {
    return NextResponse.json({ ok: true, result: await run({ season, actor: result.user }) });
  } catch (e) {
    if (e instanceof FormationError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
