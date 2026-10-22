import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { playerSchema } from "@/lib/validation";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getActiveSeason, getCurrentSeason } from "@/lib/currentSeason";
import { findOrCreatePerson } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const teamId = request.nextUrl.searchParams.get("teamId");
  // Released players are hidden unless asked for (the live console must only
  // offer current squad members).
  const includeReleased = request.nextUrl.searchParams.get("includeReleased") === "1";
  const current = await getCurrentSeason();
  const players = await prisma.player.findMany({
    where: { seasonId: current?.id ?? "none", ...(teamId ? { teamId } : {}), ...(includeReleased ? {} : { status: "ACTIVE" }) },
    include: { team: true, person: { select: { identifiers: { select: { value: true } } } } },
    orderBy: [{ status: "asc" }, { team: { name: "asc" } }, { name: "asc" }],
  });
  return NextResponse.json({ players });
}

export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const body = await request.json().catch(() => null);
  const parsed = playerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season — open one first" }, { status: 409 });

  if (parsed.data.teamId) {
    const team = await prisma.team.findUnique({ where: { id: parsed.data.teamId } });
    if (!team || team.seasonId !== season.id) {
      return NextResponse.json({ error: "That team is not part of the active season" }, { status: 400 });
    }
  }

  const { studentId, ...playerData } = parsed.data;
  const teamId = playerData.teamId ?? null;
  const { personId } = await findOrCreatePerson({ name: playerData.name, studentId });
  const alreadyOnRoster = await prisma.player.findUnique({ where: { seasonId_personId: { seasonId: season.id, personId } } });
  if (alreadyOnRoster) {
    return NextResponse.json({ error: "That person is already on this season's roster" }, { status: 409 });
  }

  if (teamId && season.squadSizeMax) {
    const size = await prisma.player.count({ where: { teamId, status: "ACTIVE" } });
    if (size >= season.squadSizeMax) {
      return NextResponse.json({ error: `That team already has the maximum of ${season.squadSizeMax} players` }, { status: 409 });
    }
  }
  if (teamId) {
    const holder = await prisma.player.findFirst({ where: { teamId, jerseyNumber: playerData.jerseyNumber, status: "ACTIVE" }, select: { name: true } });
    if (holder) {
      return NextResponse.json({ error: `Jersey #${playerData.jerseyNumber} is already worn by ${holder.name}` }, { status: 409 });
    }
  }

  try {
    const player = await prisma.player.create({
      data: { ...playerData, teamId, jerseyNumber: teamId ? playerData.jerseyNumber : 0, seasonId: season.id, personId },
    });
    await logAudit({
      actor,
      action: "player.create",
      entityType: "Player",
      entityId: player.id,
      summary: `Added player "${player.name}"`,
      after: player,
    });
    return NextResponse.json({ player }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "That jersey number is already taken on this team" },
      { status: 409 },
    );
  }
}
