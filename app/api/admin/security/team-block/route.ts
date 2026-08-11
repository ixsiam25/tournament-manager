import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const body = await request.json().catch(() => null);
  const teamId = typeof body?.teamId === "string" ? body.teamId : "";
  const blocked = typeof body?.blocked === "boolean" ? body.blocked : null;
  if (!teamId || blocked === null) {
    return NextResponse.json({ error: "Team and blocked flag are required" }, { status: 400 });
  }

  const owner = await prisma.user.findFirst({ where: { teamId, role: "OWNER" } });
  if (!owner) return NextResponse.json({ error: "This team has no manager login yet" }, { status: 404 });

  await prisma.user.update({ where: { id: owner.id }, data: { isActive: !blocked } });
  await logAudit({
    actor,
    action: blocked ? "user.block" : "user.unblock",
    entityType: "User",
    entityId: owner.id,
    summary: `${blocked ? "Blocked" : "Unblocked"} manager login for team ${teamId}`,
  });

  return NextResponse.json({ ok: true, team: { id: teamId, blocked } });
}
