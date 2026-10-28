import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { logAudit } from "@/lib/audit";
import { findInvite } from "@/lib/adminInvites";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const joinSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(30).regex(/^[a-z0-9._-]+$/i, "Username can only contain letters, numbers, dots, dashes and underscores"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

/**
 * Public: someone with an invitation link creates their profile. The account is created
 * inactive and flagged as waiting for approval — it only works once an admin approves it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (isRateLimited(`join:${clientIp(request)}`, 20, 60 * 60 * 1000)) return NextResponse.json({ error: "Too many attempts — try again later" }, { status: 429 });
  const { token } = await params;
  const { invite, state } = await findInvite(token);
  if (!invite || state !== "valid") return NextResponse.json({ error: "This invitation link is no longer valid" }, { status: 410 });

  const parsed = joinSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    const user = await prisma.$transaction(async (tx) => {
      const claimed = await tx.adminInvite.updateMany({ where: { id: invite.id, usedAt: null, revokedAt: null }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new Error("claimed");
      const created = await tx.user.create({
        data: { name: parsed.data.name, username: parsed.data.username, passwordHash, role: invite.role, isActive: false, pendingApproval: true },
      });
      await tx.adminInvite.update({ where: { id: invite.id }, data: { usedById: created.id } });
      return created;
    });
    await logAudit({ actor: null, action: "user.join", entityType: "User", entityId: user.id, summary: `${user.name} (“${user.username}”) joined by invitation as ${user.role} — waiting for approval` });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "claimed") return NextResponse.json({ error: "This invitation link is no longer valid" }, { status: 410 });
    return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
  }
}
