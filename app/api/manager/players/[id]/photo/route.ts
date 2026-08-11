import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { uploadMedia } from "@/lib/mediaStore";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MAX_BYTES = 4 * 1024 * 1024; // 4MB — the client already downscales before upload
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest, { params }: Params) {
  const result = await requireUser(["OWNER"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const teamId = actor.teamId!;

  const { id: playerId } = await params;
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  // A manager may only touch their own team's players.
  if (player.teamId !== teamId) {
    return NextResponse.json({ error: "That player isn't on your team" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Photo must be JPEG, PNG, or WebP" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Photo is too large" }, { status: 400 });
  }

  // Fresh key per upload (not keyed by playerId) so the served URL changes
  // every time a photo is replaced — that's what makes the `immutable`
  // cache header on the serving route safe.
  const key = `${playerId}-${randomUUID()}`;
  const buffer = await file.arrayBuffer();
  const photoUrl = await uploadMedia(key, buffer, file.type);
  const updated = await prisma.player.update({ where: { id: playerId }, data: { photoUrl } });

  await logAudit({
    actor,
    action: "player.photo.update",
    entityType: "Player",
    entityId: playerId,
    summary: `Manager updated ${player.name}'s photo`,
  });

  return NextResponse.json({ player: updated });
}
