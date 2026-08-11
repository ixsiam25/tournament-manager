import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { registrationReviewSchema } from "@/lib/validation";
import { approveRegistration } from "@/lib/registrationApproval";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const before = await prisma.registration.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (before.status !== "PENDING") {
    return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = registrationReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const registration = await prisma.registration.update({
    where: { id },
    data: { status: parsed.data.status, notes: parsed.data.notes, reviewedByUserId: actor.id },
  });

  if (parsed.data.status === "APPROVED") {
    const season = await prisma.season.findUnique({ where: { id: registration.seasonId } });
    if (season) await approveRegistration(registration, season);
  }

  await logAudit({
    actor,
    action: "registration.review",
    entityType: "Registration",
    entityId: id,
    summary: `${parsed.data.status === "APPROVED" ? "Approved" : "Rejected"} registration for "${registration.name}"`,
    before: { status: before.status },
    after: { status: registration.status },
  });

  return NextResponse.json({ registration });
}
