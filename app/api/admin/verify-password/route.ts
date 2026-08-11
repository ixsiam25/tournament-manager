import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";
import { verifyPassword } from "@/lib/passwords";
import { prisma } from "@/lib/db";

/** Re-checks the *current session user's own* password before a pending
 * destructive action goes through (delete team/player/fixture, reset
 * match, undo event) — independent of the session cookie, so a stolen or
 * left-open session alone isn't enough. Per-account now that logins are
 * real accounts, rather than a single shared admin password. */
export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN", "SCORER", "OWNER"]);
  if (result instanceof NextResponse) return result;
  const { user } = result;

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  const record = await prisma.user.findUnique({ where: { id: user.id } });
  if (!password || !record || !(await verifyPassword(password, record.passwordHash))) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
