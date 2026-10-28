import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { registrationReviewSchema, registrationSchema } from "@/lib/validation";
import { approveRegistration } from "@/lib/registrationApproval";
import { normalizeStudentId } from "@/lib/identity";
import { resolveApplicationConfig } from "@/lib/applicationConfig";
import { formatBatch, parseBatch } from "@/lib/batch";
import { getActiveSeason } from "@/lib/currentSeason";

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

/**
 * Admin overwrite: fix an application whatever its status (applicants often pick the
 * wrong semester). Name, batch, position and contact can always change; the student ID
 * only until the application is approved, because after that it pins the person's
 * identity across seasons. For an approved application the roster player's name and
 * position follow. Teams already formed are not moved — use the formation board for that.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const before = await prisma.registration.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const season = await getActiveSeason();
  if (!season || season.id !== before.seasonId) return NextResponse.json({ error: "This season is closed — its applications can't be edited" }, { status: 409 });

  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });

  let affiliation = parsed.data.affiliation;
  if (resolveApplicationConfig(season.applicationConfig).affiliationKind === "batch") {
    const batch = parseBatch(affiliation);
    if (!batch) return NextResponse.json({ error: "Enter the batch like “Fall 24” or “Spring 25”" }, { status: 400 });
    affiliation = formatBatch(batch);
  }

  const idLocked = before.status === "APPROVED";
  const nextStudentId = idLocked ? before.studentId : normalizeStudentId(parsed.data.studentId);
  if (!idLocked && nextStudentId) {
    const clash = await prisma.registration.findFirst({ where: { seasonId: before.seasonId, studentId: nextStudentId, id: { not: id } }, select: { id: true } });
    if (clash) return NextResponse.json({ error: "Another application in this season already uses that student ID" }, { status: 409 });
  }
  try {
    const registration = await prisma.registration.update({
      where: { id },
      data: {
        name: parsed.data.name,
        affiliation,
        position: parsed.data.position ?? null,
        contact: parsed.data.contact,
        studentId: nextStudentId,
      },
    });
    if (registration.status === "APPROVED" && registration.personId) {
      await prisma.player.updateMany({
        where: { seasonId: registration.seasonId, personId: registration.personId },
        data: { name: registration.name, position: registration.position },
      });
    }
    await logAudit({
      actor,
      action: "registration.edit",
      entityType: "Registration",
      entityId: id,
      summary: `Edited application for "${registration.name}"${before.affiliation !== registration.affiliation ? ` (batch ${before.affiliation} → ${registration.affiliation})` : ""}`,
      before: { name: before.name, affiliation: before.affiliation, position: before.position, contact: before.contact, studentId: before.studentId },
      after: { name: registration.name, affiliation: registration.affiliation, position: registration.position, contact: registration.contact, studentId: registration.studentId },
    });
    return NextResponse.json({ registration });
  } catch (e) {
    if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Another application in this season already uses that student ID" }, { status: 409 });
    }
    throw e;
  }
}
