import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const existing = await prisma.match.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!existing.homeTeamId || !existing.awayTeamId) {
    return NextResponse.json({ error: "Both teams must be assigned before starting" }, { status: 400 });
  }
  if (existing.status !== "SCHEDULED") {
    return NextResponse.json({ error: "Match already started or finished" }, { status: 409 });
  }

  const match = await prisma.match.update({
    where: { id },
    data: { status: "LIVE", startedAt: new Date() },
  });
  return NextResponse.json({ match });
}
