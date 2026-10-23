import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { frozenSeasonResponse } from "@/lib/seasonGuard";
import { MAX_CUTOUT_BYTES } from "@/lib/applicationForm";
import { putObject } from "@/lib/mediaStore";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Attach a background-removed PNG to a player's card — made by re-running the
 * removal in the organiser's browser, or uploaded from any editor. */
export async function POST(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;

  const player = await prisma.player.findUnique({ where: { id } });
  if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const frozen = await frozenSeasonResponse(player.seasonId);
  if (frozen) return frozen;

  const file = (await request.formData().catch(() => null))?.get("cutout");
  if (!(file instanceof File)) return NextResponse.json({ error: "No cut-out provided" }, { status: 400 });
  if (file.type !== "image/png") return NextResponse.json({ error: "The cut-out must be a PNG" }, { status: 400 });
  if (file.size > MAX_CUTOUT_BYTES) return NextResponse.json({ error: "The cut-out is too large" }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((b, i) => bytes[i] === b)) return NextResponse.json({ error: "That file isn't a valid PNG" }, { status: 400 });

  const key = `cutout-${id}-${randomUUID()}`;
  try {
    await putObject(key, bytes, "image/png");
  } catch (error) {
    console.error("[cutout] upload to R2 failed:", error);
    return NextResponse.json({ error: "Photo storage is unavailable right now" }, { status: 503 });
  }
  await prisma.player.update({ where: { id }, data: { cutoutKey: key } });
  await logAudit({ actor, action: "player.cutout", entityType: "Player", entityId: id, summary: `Updated ${player.name}'s card cut-out` });
  return NextResponse.json({ ok: true, url: `/api/photos/${key}` });
}

/** Back to the plain photo. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;
  const player = await prisma.player.findUnique({ where: { id } });
  if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const frozen = await frozenSeasonResponse(player.seasonId);
  if (frozen) return frozen;
  await prisma.player.update({ where: { id }, data: { cutoutKey: null } });
  await logAudit({ actor, action: "player.cutout", entityType: "Player", entityId: id, summary: `Removed ${player.name}'s card cut-out` });
  return NextResponse.json({ ok: true });
}
