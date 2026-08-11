import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fixtureSchema } from "@/lib/validation";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { MATCH_DISPLAY_ORDER_BY } from "@/lib/matchOrder";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const matches = await prisma.match.findMany({
    include: { homeTeam: true, awayTeam: true },
    orderBy: MATCH_DISPLAY_ORDER_BY,
  });
  return NextResponse.json({ matches });
}

export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const body = await request.json().catch(() => null);
  const parsed = fixtureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const { scheduledAt, ...rest } = parsed.data;
  const match = await prisma.match.create({
    data: { ...rest, scheduledAt: scheduledAt ? new Date(scheduledAt) : null },
  });
  await logAudit({
    actor,
    action: "fixture.create",
    entityType: "Match",
    entityId: match.id,
    summary: `Added a ${match.round.toLowerCase()} fixture`,
    after: match,
  });
  return NextResponse.json({ match }, { status: 201 });
}
