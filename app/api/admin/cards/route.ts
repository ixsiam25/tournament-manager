import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";
import { getCurrentSeason } from "@/lib/currentSeason";
import { getCards } from "@/lib/cardData";

export const dynamic = "force-dynamic";

/** Every card in the current edition (including unassigned players) for the organiser editor. */
export async function GET(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const season = await getCurrentSeason();
  if (!season) return NextResponse.json({ season: null, cards: [] });
  const cards = await getCards(season.id, { includePool: true, teamId: request.nextUrl.searchParams.get("teamId") });
  return NextResponse.json({ season: { id: season.id, name: season.name, status: season.status }, cards });
}
