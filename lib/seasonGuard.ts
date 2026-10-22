import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Frozen (ARCHIVED) editions are permanent records. Any mutation of a row
 * that belongs to one — team, player, match, event — must refuse. Returns the
 * 409 response to send, or null when the season is open (or unknown, so
 * callers' own not-found handling still applies).
 */
export async function frozenSeasonResponse(seasonId: string | null | undefined): Promise<NextResponse | null> {
  if (!seasonId) return null;
  const season = await prisma.season.findUnique({ where: { id: seasonId }, select: { status: true, name: true } });
  if (season?.status === "ARCHIVED") {
    return NextResponse.json(
      { error: `"${season.name}" is frozen (archived) — its data can no longer be changed.` },
      { status: 409 },
    );
  }
  return null;
}
