import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { registrationSchema } from "@/lib/validation";
import { approveRegistration } from "@/lib/registrationApproval";
import { normalizeStudentId } from "@/lib/identity";
import { resolveApplicationConfig } from "@/lib/applicationConfig";
import { formatBatch, parseBatch } from "@/lib/batch";
import { getActiveSeason } from "@/lib/currentSeason";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ registrations: [] });

  const status = request.nextUrl.searchParams.get("status");
  const registrations = await prisma.registration.findMany({
    where: { seasonId: season.id, ...(status ? { status: status as "PENDING" | "APPROVED" | "REJECTED" } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ registrations });
}

/** Admin manual add — a walk-in who didn't use the self-serve form.
 * Auto-approved immediately, since admin entering it deliberately is
 * already the review step. */
export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });

  const body = await request.json().catch(() => null);
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  let affiliation = parsed.data.affiliation;
  if (resolveApplicationConfig(season.applicationConfig).affiliationKind === "batch") {
    const batch = parseBatch(affiliation);
    if (!batch) return NextResponse.json({ error: "Enter the batch like “Fall 24” or “Spring 25”" }, { status: 400 });
    affiliation = formatBatch(batch);
  }

  const registration = await prisma.registration.create({
    data: {
      seasonId: season.id,
      name: parsed.data.name,
      affiliation,
      position: parsed.data.position,
      contact: parsed.data.contact,
      studentId: normalizeStudentId(parsed.data.studentId),
      source: "ADMIN_MANUAL",
      status: "APPROVED",
      reviewedByUserId: actor.id,
    },
  });

  const { personId } = await approveRegistration(registration, season);
  const player = await prisma.player.findUnique({ where: { seasonId_personId: { seasonId: season.id, personId } }, select: { id: true } });
  await logAudit({
    actor,
    action: "registration.create",
    entityType: "Registration",
    entityId: registration.id,
    summary: `Manually added registration for "${registration.name}"`,
  });

  return NextResponse.json({ registration, playerId: player?.id ?? null }, { status: 201 });
}
