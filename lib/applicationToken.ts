import { createHash, randomBytes } from "node:crypto";

/** The edit link is the applicant's only credential for their own application,
 * so it is long, random, shown once, and stored only as a hash. */
export function generateEditToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashEditToken(token) };
}

export function hashEditToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
