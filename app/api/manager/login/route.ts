import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import { USER_COOKIE_NAME, createUserSessionToken } from "@/lib/userAuth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const teamId = typeof body?.teamId === "string" ? body.teamId : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!teamId || !password) {
    return NextResponse.json({ error: "Team and password are required" }, { status: 400 });
  }

  const owner = await prisma.user.findFirst({ where: { teamId, role: "OWNER" }, include: { team: true } });
  if (!owner || !(await verifyPassword(password, owner.passwordHash))) {
    return NextResponse.json({ error: "Incorrect team or password" }, { status: 401 });
  }
  if (!owner.isActive) {
    return NextResponse.json(
      { error: "This team's login has been blocked by the admin" },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ ok: true, teamName: owner.team?.name });
  response.cookies.set(USER_COOKIE_NAME, await createUserSessionToken(owner.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
