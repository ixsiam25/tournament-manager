import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Revokes an unused invitation: its link stops working. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;
  const invite = await prisma.adminInvite.findUnique({ where: { id } });
  if (!invite || invite.usedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.adminInvite.update({ where: { id }, data: { revokedAt: new Date() } });
  await logAudit({ actor, action: "invite.revoke", entityType: "AdminInvite", entityId: id, summary: `Revoked a ${invite.role} invitation` });
  return NextResponse.json({ ok: true });
}
