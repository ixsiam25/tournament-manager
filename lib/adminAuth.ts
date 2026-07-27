import { createSignedToken, timingSafeEqual, verifySignedToken } from "@/lib/signing";
import { getAdminPasswordHash } from "@/lib/settings";
import { verifyPassword } from "@/lib/passwords";

export const ADMIN_COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const SUBJECT = "admin";

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not set");
  return secret;
}

export async function createAdminSessionToken(): Promise<string> {
  return createSignedToken(getSecret(), SUBJECT, SESSION_TTL_MS);
}

export async function verifyAdminSessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  const verified = await verifySignedToken(getSecret(), token);
  return verified?.subject === SUBJECT;
}

/**
 * Checks against the DB-stored password hash (settable from the admin
 * security page) once one exists; falls back to the ADMIN_PASSWORD env var
 * for a fresh DB that's never had its password changed via the UI.
 */
export async function checkAdminPassword(password: string): Promise<boolean> {
  if (!password) return false;

  const hash = await getAdminPasswordHash();
  if (hash) return verifyPassword(password, hash);

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(password, expected);
}
