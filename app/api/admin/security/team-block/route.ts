import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const teamId = typeof body?.teamId === "string" ? body.teamId : "";
  const blocked = typeof body?.blocked === "boolean" ? body.blocked : null;
  if (!teamId || blocked === null) {
    return NextResponse.json({ error: "Team and blocked flag are required" }, { status: 400 });
  }

  const team = await prisma.team.update({
    where: { id: teamId },
    data: { managerLoginBlocked: blocked },
  });
  return NextResponse.json({ ok: true, team: { id: team.id, blocked: team.managerLoginBlocked } });
}
