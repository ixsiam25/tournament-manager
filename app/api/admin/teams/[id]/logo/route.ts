import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { uploadMedia } from "@/lib/mediaStore";
import { frozenSeasonResponse } from "@/lib/seasonGuard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Organiser upload of a team's logo (PNG keeps its transparency). */
export async function POST(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;

  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  const frozen = await frozenSeasonResponse(team.seasonId);
  if (frozen) return frozen;

  const file = (await request.formData().catch(() => null))?.get("logo");
  if (!(file instanceof File)) return NextResponse.json({ error: "No logo provided" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Logo must be PNG, JPEG or WebP" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Logo is too large (max 2 MB)" }, { status: 400 });

  let logoUrl: string;
  try {
    logoUrl = await uploadMedia(`team-${id}-${randomUUID()}`, await file.arrayBuffer(), file.type);
  } catch (error) {
    console.error("[team-logo] upload failed:", error);
    return NextResponse.json({ error: "Logo storage is unavailable right now" }, { status: 503 });
  }
  await prisma.team.update({ where: { id }, data: { logoUrl } });
  await logAudit({ actor, action: "team.logo", entityType: "Team", entityId: id, summary: `Updated the logo of "${team.name}"` });
  return NextResponse.json({ ok: true, logoUrl });
}
