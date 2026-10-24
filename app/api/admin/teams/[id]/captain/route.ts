import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { frozenSeasonResponse } from "@/lib/seasonGuard";
import { placePlayerFree } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const schema = z.object({ playerId: z.string().min(1).nullable() });

/**
 * Names (or clears) a team's captain. Picking someone who has no team yet puts
 * them on this team at no charge — the usual way captains are set before a draft
 * or auction — and an unsold/queued auction lot for them is closed out so the
 * auction never offers them again. One captain per team.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "playerId is required (or null to clear)" }, { status: 400 });

  const team = await prisma.team.findUnique({ where: { id }, include: { season: true } });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  const frozen = await frozenSeasonResponse(team.seasonId);
  if (frozen) return frozen;

  const playerId = parsed.data.playerId;
  if (playerId === null) {
    await prisma.player.updateMany({ where: { teamId: id, isCaptain: true }, data: { isCaptain: false } });
    await logAudit({ actor, action: "team.captain", entityType: "Team", entityId: id, summary: `Cleared the captain of "${team.name}"` });
    return NextResponse.json({ ok: true });
  }

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player || player.seasonId !== team.seasonId || player.status !== "ACTIVE") {
    return NextResponse.json({ error: "That player isn't available in this season" }, { status: 404 });
  }
  if (player.teamId && player.teamId !== id) {
    return NextResponse.json({ error: `${player.name} is already on another team` }, { status: 409 });
  }
  if (!player.teamId) {
    const max = team.season.squadSizeMax;
    if (max && (await prisma.player.count({ where: { teamId: id, status: "ACTIVE" } })) >= max) {
      return NextResponse.json({ error: `${team.name} already has the maximum of ${max} players` }, { status: 409 });
    }
    await placePlayerFree({ playerId, teamId: id, actor });
  }
  await prisma.$transaction([
    prisma.player.updateMany({ where: { teamId: id, isCaptain: true, id: { not: playerId } }, data: { isCaptain: false } }),
    prisma.player.update({ where: { id: playerId }, data: { isCaptain: true } }),
  ]);
  await logAudit({ actor, action: "team.captain", entityType: "Team", entityId: id, summary: `${player.name} is captain of "${team.name}"` });
  return NextResponse.json({ ok: true });
}
