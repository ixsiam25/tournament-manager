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
  if (existing.status !== "LIVE") {
    return NextResponse.json({ error: "Match is not live" }, { status: 409 });
  }

  const match = await prisma.match.update({
    where: { id },
    data: { status: "FINISHED", finishedAt: new Date() },
  });
  return NextResponse.json({ match });
}
