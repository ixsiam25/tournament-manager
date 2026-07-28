import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import { MANAGER_COOKIE_NAME, createManagerSessionToken } from "@/lib/managerAuth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const teamId = typeof body?.teamId === "string" ? body.teamId : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!teamId || !password) {
    return NextResponse.json({ error: "Team and password are required" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team?.managerPasswordHash || !(await verifyPassword(password, team.managerPasswordHash))) {
    return NextResponse.json({ error: "Incorrect team or password" }, { status: 401 });
  }
  if (team.managerLoginBlocked) {
    return NextResponse.json(
      { error: "This team's login has been blocked by the admin" },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ ok: true, teamName: team.name });
  response.cookies.set(MANAGER_COOKIE_NAME, await createManagerSessionToken(team.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
