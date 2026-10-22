import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { playerSchema } from "@/lib/validation";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getActiveSeason, getCurrentSeason } from "@/lib/currentSeason";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const teamId = request.nextUrl.searchParams.get("teamId");
  const current = await getCurrentSeason();
  const players = await prisma.player.findMany({
    where: { seasonId: current?.id ?? "none", ...(teamId ? { teamId } : {}) },
    include: { team: true },
    orderBy: [{ team: { name: "asc" } }, { jerseyNumber: "asc" }],
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

  try {
    const player = await prisma.player.create({ data: { ...parsed.data, seasonId: season.id } });
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
