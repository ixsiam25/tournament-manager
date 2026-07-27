import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { hashPassword } from "@/lib/passwords";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const teamId = typeof body?.teamId === "string" ? body.teamId : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!teamId) {
    return NextResponse.json({ error: "Team is required" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const hash = await hashPassword(password);
  const team = await prisma.team.update({
    where: { id: teamId },
    data: { managerPasswordHash: hash },
  });
  return NextResponse.json({ ok: true, team: { id: team.id, name: team.name } });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const teamId = typeof body?.teamId === "string" ? body.teamId : "";
  if (!teamId) {
    return NextResponse.json({ error: "Team is required" }, { status: 400 });
  }

  await prisma.team.update({ where: { id: teamId }, data: { managerPasswordHash: null } });
  return NextResponse.json({ ok: true });
}
