import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fixtureSchema } from "@/lib/validation";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// SCORER needs GET too — this is what LiveConsole loads the match through.
export async function GET(_request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN", "SCORER"]);
  if (result instanceof NextResponse) return result;

  const { id } = await params;
  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      homeTeam: true,
      awayTeam: true,
      events: {
        include: { player: true, team: true },
        orderBy: { sequence: "desc" },
      },
    },
  });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ match });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = fixtureSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const before = await prisma.match.findUnique({ where: { id } });
  const { scheduledAt, ...rest } = parsed.data;
  const match = await prisma.match.update({
    where: { id },
    data: {
      ...rest,
      ...(scheduledAt !== undefined
        ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }
        : {}),
    },
  });
  await logAudit({
    actor,
    action: "fixture.update",
    entityType: "Match",
    entityId: match.id,
    summary: `Edited a ${match.round.toLowerCase()} fixture`,
    before,
    after: match,
  });
  return NextResponse.json({ match });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const before = await prisma.match.findUnique({ where: { id } });
  await prisma.match.delete({ where: { id } });
  await logAudit({
    actor,
    action: "fixture.delete",
    entityType: "Match",
    entityId: id,
    summary: `Deleted a ${before?.round.toLowerCase() ?? ""} fixture`,
    before,
  });
  return NextResponse.json({ ok: true });
}
