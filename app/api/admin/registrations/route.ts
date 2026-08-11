import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { registrationSchema } from "@/lib/validation";
import { approveRegistration } from "@/lib/registrationApproval";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
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

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });

  const body = await request.json().catch(() => null);
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const registration = await prisma.registration.create({
    data: {
      seasonId: season.id,
      name: parsed.data.name,
      affiliation: parsed.data.affiliation,
      position: parsed.data.position,
      contact: parsed.data.contact,
      source: "ADMIN_MANUAL",
      status: "APPROVED",
      reviewedByUserId: actor.id,
    },
  });

  await approveRegistration(registration, season);
  await logAudit({
    actor,
    action: "registration.create",
    entityType: "Registration",
    entityId: registration.id,
    summary: `Manually added registration for "${registration.name}"`,
  });

  return NextResponse.json({ registration }, { status: 201 });
}
