import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  return NextResponse.json({ season });
}

const patchSchema = z.object({
  registrationOpen: z.boolean().optional(),
});

/** Small, generic toggle endpoint for the active season's admin-controlled
 * switches — currently just `registrationOpen` (the soft-target
 * registration cutoff, always a manual admin action, never automatic). */
export async function PATCH(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const updated = await prisma.season.update({ where: { id: season.id }, data: parsed.data });
  await logAudit({
    actor,
    action: "season.update",
    entityType: "Season",
    entityId: season.id,
    summary: `Updated active season settings: ${Object.keys(parsed.data).join(", ") || "no changes"}`,
    before: { registrationOpen: season.registrationOpen },
    after: { registrationOpen: updated.registrationOpen },
  });

  return NextResponse.json({ season: updated });
}
