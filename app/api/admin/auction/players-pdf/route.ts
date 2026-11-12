import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { getActiveSeason } from "@/lib/currentSeason";
import { sameOriginImage } from "@/lib/cardData";
import { resolveApplicationConfig } from "@/lib/applicationConfig";
import { buildPlayerListPdf, type PlayerListRow } from "@/lib/playerListPdf";
import { listNotes, semesterCell, sortPlayerRows } from "@/lib/playerListRows";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The handout for team managers and captains: everyone in the season with their picture — captains in green,
 * players already placed with a team in red (not up for bidding), the rest are the ones to bid for. */
export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });
  const meaning = resolveApplicationConfig(season.applicationConfig).batchMeaning;

  const [players, regs] = await Promise.all([
    prisma.player.findMany({ where: { seasonId: season.id, status: "ACTIVE" }, include: { team: { select: { name: true } } } }),
    prisma.registration.findMany({ where: { seasonId: season.id, status: "APPROVED", personId: { not: null } }, select: { personId: true, affiliation: true } }),
  ]);
  const affiliation = new Map(regs.map((r) => [r.personId!, r.affiliation]));
  const rows: PlayerListRow[] = players.map((p) => ({
    name: p.name,
    semester: semesterCell(affiliation.get(p.personId), meaning),
    position: p.position,
    imageUrl: sameOriginImage(p.photoUrl) ?? (p.cutoutKey ? `/api/photos/${p.cutoutKey}` : null),
    kind: p.isCaptain && p.teamId ? "captain" : p.teamId ? "placed" : "normal",
  }));
  const placedTeams = [...new Set(players.filter((p) => p.teamId && !p.isCaptain).map((p) => p.team?.name ?? ""))].filter(Boolean).sort();

  const bytes = await buildPlayerListPdf({ title: season.name, subtitle: "Player list", notes: listNotes(rows, placedTeams, true), rows: sortPlayerRows(rows) });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="bfl-player-list-${season.slug}-${date}.pdf"` },
  });
}
