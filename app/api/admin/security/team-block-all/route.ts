import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const body = await request.json().catch(() => null);
  const blocked = typeof body?.blocked === "boolean" ? body.blocked : null;
  if (blocked === null) {
    return NextResponse.json({ error: "Blocked flag is required" }, { status: 400 });
  }

  const { count } = await prisma.user.updateMany({ where: { role: "OWNER" }, data: { isActive: !blocked } });
  await logAudit({
    actor,
    action: blocked ? "user.block_all" : "user.unblock_all",
    entityType: "User",
    summary: `${blocked ? "Blocked" : "Unblocked"} all ${count} manager login(s)`,
  });

  return NextResponse.json({ ok: true });
}
