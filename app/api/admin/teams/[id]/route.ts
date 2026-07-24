import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { teamSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = teamSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const team = await prisma.team.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ team });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  await prisma.team.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
