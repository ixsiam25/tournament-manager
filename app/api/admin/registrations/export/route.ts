import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { getCurrentSeason } from "@/lib/currentSeason";
import { resolveApplicationConfig } from "@/lib/applicationConfig";
import { sameOriginImage } from "@/lib/cardData";
import { buildPlayerListPdf, type PlayerListRow } from "@/lib/playerListPdf";
import { listNotes, semesterCell, sortPlayerRows } from "@/lib/playerListRows";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FILTERS = { approved: "Player list", pending: "Pending applications", rejected: "Rejected applications", all: "All applications" } as const;
type Filter = keyof typeof FILTERS;

/**
 * The applicant list as a PDF in the BFL player-list format (Name | Semester | Position | Photo):
 * `?status=approved` (the default, the player list), `pending`, `rejected` or `all`. Captains are
 * green rows marked (C); players already placed with a team are red rows.
 */
export async function GET(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const season = await getCurrentSeason();
  if (!season) return NextResponse.json({ error: "No season yet" }, { status: 404 });
  const filter = (request.nextUrl.searchParams.get("status")?.toLowerCase() ?? "approved") as Filter;
  if (!(filter in FILTERS)) return NextResponse.json({ error: "status must be approved, pending, rejected or all" }, { status: 400 });
  const meaning = resolveApplicationConfig(season.applicationConfig).batchMeaning;

  const regs = await prisma.registration.findMany({ where: { seasonId: season.id, ...(filter === "all" ? {} : { status: filter.toUpperCase() as "APPROVED" | "PENDING" | "REJECTED" }) } });
  const players = await prisma.player.findMany({ where: { seasonId: season.id, personId: { in: regs.map((r) => r.personId).filter((x): x is string => !!x) } }, include: { team: { select: { name: true } } } });
  const playerOf = new Map(players.map((p) => [p.personId, p]));

  const rows: PlayerListRow[] = regs.map((r) => {
    const p = r.personId ? playerOf.get(r.personId) : undefined;
    const active = p?.status === "ACTIVE";
    return {
      name: r.name,
      semester: semesterCell(r.affiliation, meaning),
      position: r.position,
      imageUrl: sameOriginImage(p?.photoUrl) ?? (r.photoKey ? `/api/photos/${r.photoKey}` : null),
      kind: r.status === "APPROVED" && active && p?.teamId ? (p.isCaptain ? "captain" : "placed") : "normal",
    };
  });
  const placedTeams = [...new Set(players.filter((p) => p.status === "ACTIVE" && p.teamId && !p.isCaptain).map((p) => p.team?.name ?? ""))].filter(Boolean).sort();

  const bytes = await buildPlayerListPdf({ title: season.name, subtitle: FILTERS[filter], notes: listNotes(rows, placedTeams, season.teamFormation === "AUCTION"), rows: sortPlayerRows(rows) });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="bfl-${filter === "approved" ? "player-list" : `${filter}-applications`}-${season.slug}-${date}.pdf"` },
  });
}
