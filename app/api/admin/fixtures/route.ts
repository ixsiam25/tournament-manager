import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fixtureSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const matches = await prisma.match.findMany({
    include: { homeTeam: true, awayTeam: true },
    orderBy: [{ round: "asc" }, { scheduledAt: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ matches });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = fixtureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const { scheduledAt, ...rest } = parsed.data;
  const match = await prisma.match.create({
    data: { ...rest, scheduledAt: scheduledAt ? new Date(scheduledAt) : null },
  });
  return NextResponse.json({ match }, { status: 201 });
}
