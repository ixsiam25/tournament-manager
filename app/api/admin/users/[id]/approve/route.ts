import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ role: z.enum(["ADMIN", "SCORER"]).optional() });

/** Approve someone who joined by invitation (optionally adjusting their role). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || !target.pendingApproval) return NextResponse.json({ error: "Not waiting for approval" }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  const role = parsed.success ? parsed.data.role : undefined;
  const user = await prisma.user.update({ where: { id }, data: { isActive: true, pendingApproval: false, ...(role ? { role } : {}) }, select: { id: true, name: true, username: true, role: true } });
  await logAudit({ actor, action: "user.approve", entityType: "User", entityId: id, summary: `Approved “${user.username}” as ${user.role}` });
  return NextResponse.json({ user });
}

/** Decline a pending joiner: the account is removed. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || !target.pendingApproval) return NextResponse.json({ error: "Not waiting for approval" }, { status: 404 });
  await prisma.adminInvite.updateMany({ where: { usedById: id }, data: { usedById: null } });
  await prisma.user.delete({ where: { id } });
  await logAudit({ actor, action: "user.decline", entityType: "User", entityId: id, summary: `Declined “${target.username}” (joined by invitation)` });
  return NextResponse.json({ ok: true });
}
