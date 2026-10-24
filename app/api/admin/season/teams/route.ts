import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { getCurrentSeason } from "@/lib/currentSeason";

export const dynamic = "force-dynamic";

/** Everything the "Set up the teams" screen needs: each team with its logo,
 * manager, login status and captain, plus the players still without a team
 * (the candidates for captain). */
export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const season = await getCurrentSeason();
  if (!season) return NextResponse.json({ season: null });

  const [teams, pool, owners] = await Promise.all([
    prisma.team.findMany({
      where: { seasonId: season.id },
      orderBy: { name: "asc" },
      include: { players: { where: { status: "ACTIVE" }, select: { id: true, name: true, isCaptain: true, position: true } } },
    }),
    prisma.player.findMany({ where: { seasonId: season.id, teamId: null, status: "ACTIVE" }, select: { id: true, name: true, position: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "OWNER", team: { seasonId: season.id } }, select: { teamId: true } }),
  ]);
  const hasLogin = new Set(owners.map((o) => o.teamId));

  return NextResponse.json({
    season: { id: season.id, name: season.name, status: season.status, teamFormation: season.teamFormation, squadSizeMax: season.squadSizeMax },
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      managerName: t.managerName,
      logoUrl: t.logoUrl,
      hasManagerLogin: hasLogin.has(t.id),
      players: t.players.length,
      captainId: t.players.find((p) => p.isCaptain)?.id ?? null,
      squad: t.players.map((p) => ({ id: p.id, name: p.name, position: p.position })),
    })),
    pool,
  });
}
