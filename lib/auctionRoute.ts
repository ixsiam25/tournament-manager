import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { getActiveSeason } from "@/lib/currentSeason";
import { AuctionError, type AuctionCtx } from "@/lib/auctionService";

/** Shared wrapper for the auction endpoints: ADMIN only, the ACTIVE season,
 * its settings loaded, and service errors turned into friendly responses. */
export async function auctionAction(run: (ctx: AuctionCtx) => Promise<unknown>): Promise<NextResponse> {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });
  const settings = await prisma.auctionSettings.findUnique({ where: { seasonId: season.id } });
  if (!settings) return NextResponse.json({ error: "Auction settings not configured" }, { status: 409 });
  try {
    return NextResponse.json({ ok: true, result: await run({ season, settings, actor: result.user }) });
  } catch (e) {
    if (e instanceof AuctionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
