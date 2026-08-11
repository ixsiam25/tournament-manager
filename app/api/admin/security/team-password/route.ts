import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";
import { hashPassword } from "@/lib/passwords";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

/** Sets (or resets) the password for a team's OWNER account, creating that
 * account the first time a password is set for a team that doesn't have
 * one yet. Superseded `Team.managerPasswordHash` — see /admin/users for
 * ADMIN/SCORER account management and this route for team OWNER accounts,
 * since those are still best managed alongside the team they belong to. */
export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const body = await request.json().catch(() => null);
  const teamId = typeof body?.teamId === "string" ? body.teamId : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!teamId) {
    return NextResponse.json({ error: "Team is required" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findFirst({ where: { teamId, role: "OWNER" } });
  const owner = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } })
    : await prisma.user.create({
        data: {
          name: team.managerName ?? team.name,
          username: `owner-${team.id}`,
          passwordHash,
          role: "OWNER",
          teamId: team.id,
        },
      });

  await logAudit({
    actor,
    action: existing ? "user.password.reset" : "user.create",
    entityType: "User",
    entityId: owner.id,
    summary: `${existing ? "Reset" : "Set"} manager login password for "${team.name}"`,
  });

  return NextResponse.json({ ok: true, team: { id: team.id, name: team.name } });
}

export async function DELETE(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const body = await request.json().catch(() => null);
  const teamId = typeof body?.teamId === "string" ? body.teamId : "";
  if (!teamId) {
    return NextResponse.json({ error: "Team is required" }, { status: 400 });
  }

  const owner = await prisma.user.findFirst({ where: { teamId, role: "OWNER" } });
  if (owner) {
    await prisma.user.delete({ where: { id: owner.id } });
    await logAudit({
      actor,
      action: "user.delete",
      entityType: "User",
      entityId: owner.id,
      summary: `Removed manager login for team ${teamId}`,
    });
  }
  return NextResponse.json({ ok: true });
}
