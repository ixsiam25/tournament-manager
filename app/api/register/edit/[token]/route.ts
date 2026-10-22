import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isRateLimited, clientIp } from "@/lib/rateLimit";
import { resolveApplicationConfig } from "@/lib/applicationConfig";
import { isApplicationOpen, parseApplicationForm, storeApplicantPhoto } from "@/lib/applicationForm";
import { hashEditToken } from "@/lib/applicationToken";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

async function findByToken(token: string) {
  if (!token || token.length < 20 || token.length > 100) return null;
  return prisma.registration.findUnique({
    where: { editTokenHash: hashEditToken(token) },
    include: { season: true },
  });
}

/** An application is editable by its owner only while it is still PENDING and
 * the season is still taking applications. */
function editable(reg: NonNullable<Awaited<ReturnType<typeof findByToken>>>) {
  return reg.status === "PENDING" && reg.season.status === "ACTIVE" && isApplicationOpen(reg.season);
}

export async function GET(request: NextRequest, { params }: Params) {
  if (isRateLimited(`reg-edit-get:${clientIp(request)}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — try again later" }, { status: 429 });
  }
  const { token } = await params;
  const reg = await findByToken(token);
  if (!reg) return NextResponse.json({ error: "This link isn't valid" }, { status: 404 });

  return NextResponse.json({
    seasonName: reg.season.name,
    status: reg.status,
    editable: editable(reg),
    config: resolveApplicationConfig(reg.season.applicationConfig),
    registration: {
      name: reg.name,
      studentId: reg.studentId,
      affiliation: reg.affiliation,
      position: reg.position,
      contact: reg.contact,
      answers: (reg.answers as Record<string, string> | null) ?? {},
      photoUrl: reg.photoKey ? `/api/photos/${reg.photoKey}` : null,
      photoZoom: reg.photoZoom,
      photoX: reg.photoX,
      photoY: reg.photoY,
    },
  });
}

export async function PUT(request: NextRequest, { params }: Params) {
  if (isRateLimited(`reg-edit-put:${clientIp(request)}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — try again later" }, { status: 429 });
  }
  const { token } = await params;
  const reg = await findByToken(token);
  if (!reg) return NextResponse.json({ error: "This link isn't valid" }, { status: 404 });
  if (!editable(reg)) {
    return NextResponse.json({ error: "This application can no longer be edited" }, { status: 409 });
  }

  const config = resolveApplicationConfig(reg.season.applicationConfig);
  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  const parsed = parseApplicationForm(formData, config, !!reg.photoKey);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const app = parsed.value;

  if (app.studentId && app.studentId !== reg.studentId) {
    const clash = await prisma.registration.findFirst({
      where: { seasonId: reg.seasonId, studentId: app.studentId, status: { not: "REJECTED" }, id: { not: reg.id } },
      select: { id: true },
    });
    if (clash) return NextResponse.json({ error: "Another application already uses this student ID" }, { status: 409 });
  }

  let photoKey = reg.photoKey;
  if (app.photo) {
    try {
      photoKey = await storeApplicantPhoto(app.photo);
    } catch (error) {
      console.error("[register-edit] photo upload to R2 failed:", error);
      return NextResponse.json({ error: "Photo upload is temporarily unavailable — please try again" }, { status: 503 });
    }
  } else if (app.removePhoto) {
    photoKey = null;
  }

  await prisma.registration.update({
    where: { id: reg.id },
    data: {
      name: app.name,
      studentId: app.studentId,
      affiliation: app.affiliation,
      position: app.position,
      contact: app.contact,
      answers: Object.keys(app.answers).length ? app.answers : undefined,
      photoKey,
      photoZoom: app.framing.photoZoom,
      photoX: app.framing.photoX,
      photoY: app.framing.photoY,
      applicantEditedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true });
}
