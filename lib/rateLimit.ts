/**
 * Minimal in-memory sliding-window rate limiter — "basic anti-spam", not a
 * hardened defense. Resets on a cold start/redeploy, which is an
 * acceptable tradeoff at this scale (a small local tournament's public
 * registration form, not an internet-facing service under real attack).
 */
const hits = new Map<string, number[]>();

export function isRateLimited(key: string, maxHits: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > maxHits;
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
