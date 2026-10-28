import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

export const INVITE_DAYS = 7;

export function generateInviteToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}
export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type InviteState = "valid" | "used" | "revoked" | "expired" | "unknown";

/** Looks an invitation up by its token and says whether it can still be used. */
export async function findInvite(token: string) {
  const invite = await prisma.adminInvite.findUnique({ where: { tokenHash: hashInviteToken(token) } });
  if (!invite) return { invite: null, state: "unknown" as InviteState };
  const state: InviteState = invite.usedAt ? "used" : invite.revokedAt ? "revoked" : invite.expiresAt < new Date() ? "expired" : "valid";
  return { invite, state };
}
