import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";
import { getCurrentSeason } from "@/lib/currentSeason";
import { getBoard } from "@/lib/formationService";

export const dynamic = "force-dynamic";

/** The team-formation board for the current edition. */
export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const season = await getCurrentSeason();
  if (!season) return NextResponse.json({ error: "No season yet" }, { status: 409 });
  return NextResponse.json(await getBoard(season));
}
