import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { approveRegistration } from "@/lib/registrationApproval";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ ids: z.array(z.string()).min(1) });

export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const pending = await prisma.registration.findMany({
    where: { id: { in: parsed.data.ids }, status: "PENDING" },
  });
  if (pending.length === 0) {
    return NextResponse.json({ error: "No pending registrations in that selection" }, { status: 409 });
  }

  const seasons = new Map(
    (await prisma.season.findMany({ where: { id: { in: [...new Set(pending.map((r) => r.seasonId))] } } })).map(
      (s) => [s.id, s],
    ),
  );

  let approved = 0;
  for (const reg of pending) {
    const season = seasons.get(reg.seasonId);
    if (!season) continue;
    await prisma.registration.update({
      where: { id: reg.id },
      data: { status: "APPROVED", reviewedByUserId: actor.id },
    });
    await approveRegistration({ ...reg, status: "APPROVED" }, season);
    approved++;
  }

  await logAudit({
    actor,
    action: "registration.bulk_approve",
    entityType: "Registration",
    summary: `Bulk-approved ${approved} registration(s)`,
  });

  return NextResponse.json({ approved });
}
