import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { hashPassword } from "@/lib/passwords";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const updateUserSchema = z.object({
  role: z.enum(["ADMIN", "SCORER"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const before = await prisma.user.findUnique({ where: { id } });
  if (!before || before.role === "OWNER") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // The main admin keeps the system reachable: it can't be deactivated or demoted.
  if (before.isOwner && (parsed.data.isActive === false || (parsed.data.role !== undefined && parsed.data.role !== "ADMIN"))) {
    return NextResponse.json({ error: "The main admin can't be deactivated or demoted — it keeps the system from being locked out" }, { status: 400 });
  }
  // An ADMIN deactivating themselves would lock everyone out with no way
  // back in short of a direct DB edit — refuse it.
  if (before.id === actor.id && parsed.data.isActive === false) {
    return NextResponse.json({ error: "You can't deactivate your own account" }, { status: 400 });
  }

  if (before.pendingApproval && parsed.data.isActive === true) {
    return NextResponse.json({ error: "Approve this person first (they joined by invitation)" }, { status: 400 });
  }
  // Never leave the console without an active admin.
  if (before.role === "ADMIN" && before.isActive && (parsed.data.isActive === false || parsed.data.role === "SCORER")) {
    const others = await prisma.user.count({ where: { role: "ADMIN", isActive: true, id: { not: id } } });
    if (others === 0) return NextResponse.json({ error: "There must always be at least one active admin" }, { status: 400 });
  }

  const data: { role?: "ADMIN" | "SCORER"; isActive?: boolean; passwordHash?: string } = {};
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
  if (parsed.data.password !== undefined) data.passwordHash = await hashPassword(parsed.data.password);

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, username: true, role: true, isActive: true, isOwner: true, pendingApproval: true, createdAt: true },
  });

  const summaryParts: string[] = [];
  if (parsed.data.role !== undefined) summaryParts.push(`role → ${parsed.data.role}`);
  if (parsed.data.isActive !== undefined) summaryParts.push(parsed.data.isActive ? "reactivated" : "deactivated");
  if (parsed.data.password !== undefined) summaryParts.push("password reset");
  await logAudit({
    actor,
    action: "user.update",
    entityType: "User",
    entityId: id,
    summary: `Updated "${before.username}": ${summaryParts.join(", ") || "no changes"}`,
    before: { role: before.role, isActive: before.isActive },
    after: { role: user.role, isActive: user.isActive },
  });

  return NextResponse.json({ user });
}
