import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/adminAuth";

/**
 * Cloudflare Workers (via OpenNext) doesn't support Node.js Proxy/Middleware,
 * which is Next 16's only runtime option for it — so admin auth is enforced
 * per-route here instead of in a shared proxy.ts.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  const authed = await verifyAdminSessionToken(token);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
