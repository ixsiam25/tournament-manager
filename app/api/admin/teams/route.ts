import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { teamSchema } from "@/lib/validation";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { players: true } } },
  });
  return NextResponse.json({ teams });
}

export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const body = await request.json().catch(() => null);
  const parsed = teamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const team = await prisma.team.create({ data: parsed.data });
  const teamForAudit: Record<string, unknown> = { ...team };
  delete teamForAudit.managerPasswordHash;
  await logAudit({
    actor,
    action: "team.create",
    entityType: "Team",
    entityId: team.id,
    summary: `Added team "${team.name}"`,
    after: teamForAudit,
  });
  return NextResponse.json({ team }, { status: 201 });
}
