import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { uploadMedia } from "@/lib/mediaStore";
import { frozenSeasonResponse } from "@/lib/seasonGuard";
import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES } from "@/lib/applicationForm";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Organiser upload of a player's photo (the client has already downscaled it). */
export async function POST(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;

  const player = await prisma.player.findUnique({ where: { id } });
  if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const frozen = await frozenSeasonResponse(player.seasonId);
  if (frozen) return frozen;

  const file = (await request.formData().catch(() => null))?.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  if (!ALLOWED_PHOTO_TYPES.has(file.type)) return NextResponse.json({ error: "Photo must be JPEG, PNG, or WebP" }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: "Photo is too large" }, { status: 400 });

  let photoUrl: string;
  try {
    photoUrl = await uploadMedia(`${id}-${randomUUID()}`, await file.arrayBuffer(), file.type);
  } catch (error) {
    console.error("[admin-photo] upload to R2 failed:", error);
    return NextResponse.json({ error: "Photo storage is unavailable right now" }, { status: 503 });
  }
  const updated = await prisma.player.update({ where: { id }, data: { photoUrl } });
  await logAudit({ actor, action: "player.photo.update", entityType: "Player", entityId: id, summary: `Organiser updated ${player.name}'s photo` });
  return NextResponse.json({ player: updated });
}
