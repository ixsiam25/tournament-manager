import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { playerSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = playerSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  try {
    const player = await prisma.player.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ player });
  } catch {
    return NextResponse.json(
      { error: "That jersey number is already taken on this team" },
      { status: 409 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  await prisma.player.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
