import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";
import { getCurrentSeason } from "@/lib/currentSeason";
import { getSeasonProgress } from "@/lib/seasonProgress";

export const dynamic = "force-dynamic";

/** The current edition and its setup checklist. */
export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const season = await getCurrentSeason();
  if (!season) return NextResponse.json({ season: null, steps: [] });
  return NextResponse.json({
    season: { id: season.id, name: season.name, status: season.status, teamFormation: season.teamFormation, registrationOpen: season.registrationOpen, registrationSelfServeEnabled: season.registrationSelfServeEnabled, applicationDeadline: season.applicationDeadline },
    steps: await getSeasonProgress(season),
  });
}
