import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isRateLimited, clientIp } from "@/lib/rateLimit";
import { getActiveSeason } from "@/lib/currentSeason";
import { resolveApplicationConfig } from "@/lib/applicationConfig";
import { isApplicationOpen, parseApplicationForm, storeApplicantCutout, storeApplicantPhoto } from "@/lib/applicationForm";
import { generateEditToken } from "@/lib/applicationToken";

export const dynamic = "force-dynamic";

/** Tells the public form whether applications are open and exactly what to
 * ask for (the season's configured fields and custom questions). */
export async function GET() {
  const season = await getActiveSeason();
  const open = !!season && isApplicationOpen(season);
  return NextResponse.json({
    open,
    seasonName: season?.name ?? null,
    deadline: season?.applicationDeadline?.toISOString() ?? null,
    config: resolveApplicationConfig(season?.applicationConfig),
  });
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (isRateLimited(`register:${ip}`, 40, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many submissions from this connection — try again later" }, { status: 429 });
  }

  const season = await getActiveSeason();
  if (!season || !isApplicationOpen(season)) {
    return NextResponse.json({ error: "Applications are not open right now" }, { status: 403 });
  }
  const config = resolveApplicationConfig(season.applicationConfig);

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  const parsed = parseApplicationForm(formData, config);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const app = parsed.value;

  if (app.studentId) {
    const alreadyApplied = await prisma.registration.findFirst({
      where: { seasonId: season.id, studentId: app.studentId, status: { not: "REJECTED" } },
      select: { id: true },
    });
    if (alreadyApplied) {
      return NextResponse.json({ error: "An application with this student ID already exists for this season" }, { status: 409 });
    }
  }

  let photoKey: string | null = null;
  let cutoutKey: string | null = null;
  if (app.photo) {
    try {
      photoKey = await storeApplicantPhoto(app.photo);
      if (app.cutout) cutoutKey = await storeApplicantCutout(app.cutout).catch(() => null); // the cut-out is a nicety
    } catch (error) {
      // Fail the whole submission rather than silently dropping the photo —
      // the applicant can retry (or submit without one).
      console.error("[register] photo upload to R2 failed:", error);
      return NextResponse.json(
        { error: "Photo upload is temporarily unavailable — please try again, or submit without a photo" },
        { status: 503 },
      );
    }
  }

  const { token, hash } = generateEditToken();
  await prisma.registration.create({
    data: {
      seasonId: season.id,
      name: app.name,
      affiliation: app.affiliation,
      position: app.position,
      contact: app.contact,
      studentId: app.studentId,
      answers: Object.keys(app.answers).length ? app.answers : undefined,
      photoKey,
      cutoutKey,
      photoZoom: app.framing.photoZoom,
      photoX: app.framing.photoX,
      photoY: app.framing.photoY,
      editTokenHash: hash,
      source: "SELF_SERVE",
      status: "PENDING",
    },
  });

  // The token is returned exactly once; only its hash is stored.
  return NextResponse.json({ ok: true, editToken: token, seasonName: season.name }, { status: 201 });
}
