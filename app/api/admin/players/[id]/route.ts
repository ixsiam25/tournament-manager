import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { playerSchema } from "@/lib/validation";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = playerSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const before = await prisma.player.findUnique({ where: { id } });
  try {
    const player = await prisma.player.update({ where: { id }, data: parsed.data });
    await logAudit({
      actor,
      action: "player.update",
      entityType: "Player",
      entityId: player.id,
      summary: `Updated player "${player.name}"`,
      before,
      after: player,
    });
    return NextResponse.json({ player });
  } catch {
    return NextResponse.json(
      { error: "That jersey number is already taken on this team" },
      { status: 409 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const before = await prisma.player.findUnique({ where: { id } });
  await prisma.player.delete({ where: { id } });
  await logAudit({
    actor,
    action: "player.delete",
    entityType: "Player",
    entityId: id,
    summary: `Deleted player "${before?.name ?? id}"`,
    before,
  });
  return NextResponse.json({ ok: true });
}
