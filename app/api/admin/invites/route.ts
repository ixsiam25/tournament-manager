import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { INVITE_DAYS, generateInviteToken } from "@/lib/adminInvites";

export const dynamic = "force-dynamic";

const createSchema = z.object({ role: z.enum(["ADMIN", "SCORER"]), note: z.string().trim().max(80).optional().nullable() });

/** Invitations that can still be used (unused, not revoked, not expired). */
export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const invites = await prisma.adminInvite.findMany({
    where: { usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, role: true, note: true, expiresAt: true, createdAt: true, createdBy: { select: { name: true } } },
  });
  return NextResponse.json({ invites });
}

/** Creates a one-time invitation link. The link is returned once — only its hash is stored. */
export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });

  const { token, hash } = generateInviteToken();
  const invite = await prisma.adminInvite.create({
    data: { tokenHash: hash, role: parsed.data.role, note: parsed.data.note || null, createdById: actor.id, expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000) },
  });
  await logAudit({ actor, action: "invite.create", entityType: "AdminInvite", entityId: invite.id, summary: `Created a ${parsed.data.role} invitation${parsed.data.note ? ` (“${parsed.data.note}”)` : ""}` });
  return NextResponse.json({ id: invite.id, token, expiresAt: invite.expiresAt }, { status: 201 });
}
