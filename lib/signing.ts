// Web Crypto HMAC-SHA256 signing primitives shared by the admin and manager
// session tokens. Web Crypto only (no node:crypto) so this works in any
// runtime without polyfills.

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(secret: string, value: string): Promise<string> {
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toHex(signature);
}

/** Constant-time string comparison (Web Crypto has no timingSafeEqual). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export type VerifiedToken = { subject: string; expires: number };

/** Token format: `<subject>.<expiresAtMs>.<hmac>`. */
export async function createSignedToken(
  secret: string,
  subject: string,
  ttlMs: number,
): Promise<string> {
  const expires = Date.now() + ttlMs;
  const payload = `${subject}.${expires}`;
  return `${payload}.${await sign(secret, payload)}`;
}

export async function verifySignedToken(
  secret: string,
  token: string | undefined | null,
): Promise<VerifiedToken | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [subject, expiresStr, signature] = parts;
  const expected = await sign(secret, `${subject}.${expiresStr}`);
  if (!timingSafeEqual(expected, signature)) return null;

  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;
  return { subject, expires };
}
