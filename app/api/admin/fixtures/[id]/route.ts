import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fixtureSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

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
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = fixtureSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

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
  return NextResponse.json({ match });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  await prisma.match.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
