import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSignedToken, verifySignedToken } from "@/lib/signing";
import { prisma } from "@/lib/db";

export const MANAGER_COOKIE_NAME = "manager_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const SUBJECT_PREFIX = "team:";

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not set");
  return secret;
}

export async function createManagerSessionToken(teamId: string): Promise<string> {
  return createSignedToken(getSecret(), `${SUBJECT_PREFIX}${teamId}`, SESSION_TTL_MS);
}

/** Returns the authed team's id, or null if the token is missing/invalid/expired. */
export async function verifyManagerSessionToken(
  token: string | undefined | null,
): Promise<string | null> {
  const verified = await verifySignedToken(getSecret(), token);
  if (!verified || !verified.subject.startsWith(SUBJECT_PREFIX)) return null;
  return verified.subject.slice(SUBJECT_PREFIX.length);
}

/**
 * Per-route guard mirroring `requireAdmin()`. Returns `{ teamId }` on
 * success, or a 401 `NextResponse` to return immediately on failure:
 *
 *   const result = await requireManager();
 *   if (result instanceof NextResponse) return result;
 *   const { teamId } = result;
 */
export async function requireManager(): Promise<{ teamId: string } | NextResponse> {
  const token = (await cookies()).get(MANAGER_COOKIE_NAME)?.value;
  const teamId = await verifyManagerSessionToken(token);
  if (!teamId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Re-checked on every request (not just at login) so a mid-session block
  // by the admin takes effect immediately instead of waiting for the
  // session to expire.
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { managerLoginBlocked: true },
  });
  if (!team || team.managerLoginBlocked) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { teamId };
}
