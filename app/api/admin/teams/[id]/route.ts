import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { teamSchema } from "@/lib/validation";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Strips the password hash before a team row goes into an audit log entry
 * — no reason for it to sit in a JSON blob even in an ADMIN-only view. */
function forAudit(team: { managerPasswordHash: string | null } & Record<string, unknown>) {
  const rest: Record<string, unknown> = { ...team };
  delete rest.managerPasswordHash;
  return rest;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = teamSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const before = await prisma.team.findUnique({ where: { id } });
  const team = await prisma.team.update({ where: { id }, data: parsed.data });
  await logAudit({
    actor,
    action: "team.update",
    entityType: "Team",
    entityId: team.id,
    summary: `Updated team "${team.name}"`,
    before: before ? forAudit(before) : undefined,
    after: forAudit(team),
  });
  return NextResponse.json({ team });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const before = await prisma.team.findUnique({ where: { id } });
  await prisma.team.delete({ where: { id } });
  await logAudit({
    actor,
    action: "team.delete",
    entityType: "Team",
    entityId: id,
    summary: `Deleted team "${before?.name ?? id}"`,
    before: before ? forAudit(before) : undefined,
  });
  return NextResponse.json({ ok: true });
}
