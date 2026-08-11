import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { teamSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const managerTeamSchema = teamSchema.pick({ name: true });

export async function PATCH(request: NextRequest) {
  const result = await requireUser(["OWNER"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const teamId = actor.teamId!;

  const body = await request.json().catch(() => null);
  const parsed = managerTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const before = await prisma.team.findUnique({ where: { id: teamId } });
    const team = await prisma.team.update({
      where: { id: teamId },
      data: { name: parsed.data.name },
    });
    await logAudit({
      actor,
      action: "team.rename",
      entityType: "Team",
      entityId: team.id,
      summary: `Manager renamed team "${before?.name}" to "${team.name}"`,
      before: before ? { name: before.name } : undefined,
      after: { name: team.name },
    });
    return NextResponse.json({ team });
  } catch {
    return NextResponse.json({ error: "Another team already has that name" }, { status: 400 });
  }
}
