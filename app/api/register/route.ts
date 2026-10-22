import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { registrationSchema } from "@/lib/validation";
import { putObject } from "@/lib/mediaStore";
import { isRateLimited, clientIp } from "@/lib/rateLimit";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Whether the currently-ACTIVE season is accepting self-serve
 * registrations right now — used both to gate submission and to tell the
 * public form whether to show itself at all. */
export async function GET() {
  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  const open = !!season?.registrationSelfServeEnabled && !!season?.registrationOpen;
  return NextResponse.json({ open, seasonName: season?.name ?? null });
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (isRateLimited(`register:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many submissions from this connection — try again later" }, { status: 429 });
  }

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season || !season.registrationSelfServeEnabled || !season.registrationOpen) {
    return NextResponse.json({ error: "Registration is not open right now" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const parsed = registrationSchema.safeParse({
    name: formData?.get("name"),
    affiliation: formData?.get("affiliation"),
    position: formData?.get("position") || null,
    contact: formData?.get("contact"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  let photoKey: string | null = null;
  const file = formData?.get("photo");
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Photo must be JPEG, PNG, or WebP" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Photo is too large" }, { status: 400 });
    }
    photoKey = `registration-${randomUUID()}`;
    const buffer = await file.arrayBuffer();
    try {
      await putObject(photoKey, buffer, file.type);
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

  const registration = await prisma.registration.create({
    data: {
      seasonId: season.id,
      name: parsed.data.name,
      affiliation: parsed.data.affiliation,
      position: parsed.data.position,
      contact: parsed.data.contact,
      photoKey,
      source: "SELF_SERVE",
      status: "PENDING",
    },
  });

  return NextResponse.json({ id: registration.id }, { status: 201 });
}
