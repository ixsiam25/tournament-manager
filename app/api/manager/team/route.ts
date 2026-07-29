import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/managerAuth";
import { teamSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const managerTeamSchema = teamSchema.pick({ name: true });

export async function PATCH(request: NextRequest) {
  const result = await requireManager();
  if (result instanceof NextResponse) return result;
  const { teamId } = result;

  const body = await request.json().catch(() => null);
  const parsed = managerTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const team = await prisma.team.update({
      where: { id: teamId },
      data: { name: parsed.data.name },
    });
    return NextResponse.json({ team });
  } catch {
    return NextResponse.json({ error: "Another team already has that name" }, { status: 400 });
  }
}
