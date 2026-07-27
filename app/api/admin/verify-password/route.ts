import { NextRequest, NextResponse } from "next/server";
import { checkAdminPassword } from "@/lib/adminAuth";
import { requireAdmin } from "@/lib/requireAdmin";

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!password || !(await checkAdminPassword(password))) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
