import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const blocked = typeof body?.blocked === "boolean" ? body.blocked : null;
  if (blocked === null) {
    return NextResponse.json({ error: "Blocked flag is required" }, { status: 400 });
  }

  await prisma.team.updateMany({ data: { managerLoginBlocked: blocked } });
  return NextResponse.json({ ok: true });
}
