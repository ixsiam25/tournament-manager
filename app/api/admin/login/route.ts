import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import { USER_COOKIE_NAME, createUserSessionToken } from "@/lib/userAuth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const roleOk = user?.role === "ADMIN" || user?.role === "SCORER";
  if (!user || !roleOk || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Incorrect username or password" }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "This account has been deactivated" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, name: user.name, role: user.role });
  response.cookies.set(USER_COOKIE_NAME, await createUserSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
