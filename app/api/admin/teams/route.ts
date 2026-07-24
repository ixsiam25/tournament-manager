import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { teamSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { players: true } } },
  });
  return NextResponse.json({ teams });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = teamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const team = await prisma.team.create({ data: parsed.data });
  return NextResponse.json({ team }, { status: 201 });
}
