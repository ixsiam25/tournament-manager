import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSignedToken, verifySignedToken } from "@/lib/signing";
import { prisma } from "@/lib/db";
import type { UserRole } from "@/lib/generated/prisma/client";

export const USER_COOKIE_NAME = "user_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const SUBJECT_PREFIX = "user:";

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not set");
  return secret;
}

export async function createUserSessionToken(userId: string): Promise<string> {
  return createSignedToken(getSecret(), `${SUBJECT_PREFIX}${userId}`, SESSION_TTL_MS);
}

async function verifyUserSessionToken(token: string | undefined | null): Promise<string | null> {
  const verified = await verifySignedToken(getSecret(), token);
  if (!verified || !verified.subject.startsWith(SUBJECT_PREFIX)) return null;
  return verified.subject.slice(SUBJECT_PREFIX.length);
}

export type AuthedUser = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  teamId: string | null;
};

/**
 * Per-route guard, replacing the old `requireAdmin()` (`lib/requireAdmin.ts`,
 * now removed) and `requireManager()` (`lib/managerAuth.ts`, now removed).
 * Returns `{ user }` on success, or a 401 `NextResponse` to return
 * immediately on failure:
 *
 *   const result = await requireUser(["ADMIN", "SCORER"]);
 *   if (result instanceof NextResponse) return result;
 *   const { user } = result;
 *
 * `isActive` is re-checked on every request (not just at login), same as
 * the old `managerLoginBlocked` check — an admin deactivating someone takes
 * effect immediately instead of waiting for the session to expire.
 */
export async function requireUser(allowedRoles: UserRole[]): Promise<{ user: AuthedUser } | NextResponse> {
  const token = (await cookies()).get(USER_COOKIE_NAME)?.value;
  const userId = await verifyUserSessionToken(token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { user: { id: user.id, name: user.name, username: user.username, role: user.role, teamId: user.teamId } };
}

/**
 * Page-level equivalent of `requireUser`, for use in server components
 * (layouts/pages) where a redirect is wanted instead of a 401 response.
 * Returns the authed user or `null`.
 */
export async function getSessionUser(allowedRoles: UserRole[]): Promise<AuthedUser | null> {
  const token = (await cookies()).get(USER_COOKIE_NAME)?.value;
  const userId = await verifyUserSessionToken(token);
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || !allowedRoles.includes(user.role)) return null;
  return { id: user.id, name: user.name, username: user.username, role: user.role, teamId: user.teamId };
}
