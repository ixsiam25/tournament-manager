import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getActiveSeason } from "@/lib/currentSeason";
import { putObject } from "@/lib/mediaStore";

export const dynamic = "force-dynamic";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

/** Upload the poster / freeze frame the projector shows before the auction and during breaks. */
export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });
  const settings = await prisma.auctionSettings.findUnique({ where: { seasonId: season.id } });
  if (!settings) return NextResponse.json({ error: "Auction settings haven't been configured yet" }, { status: 409 });

  const file = (await request.formData().catch(() => null))?.get("poster");
  if (!(file instanceof File)) return NextResponse.json({ error: "No image provided" }, { status: 400 });
  if (!TYPES.has(file.type)) return NextResponse.json({ error: "The poster must be a JPEG, PNG or WebP image" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is too large (8 MB max)" }, { status: 400 });

  const key = `auction-poster-${season.id}-${randomUUID()}`;
  try {
    await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (error) {
    console.error("[auction-poster] upload failed:", error);
    return NextResponse.json({ error: "Photo storage is unavailable right now" }, { status: 503 });
  }
  await prisma.auctionSettings.update({ where: { id: settings.id }, data: { posterKey: key } });
  await logAudit({ actor, action: "auction.poster", entityType: "Season", entityId: season.id, summary: "Uploaded the auction poster" });
  return NextResponse.json({ ok: true, url: `/api/photos/${key}` });
}

export async function DELETE() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });
  await prisma.auctionSettings.updateMany({ where: { seasonId: season.id }, data: { posterKey: null, stageMode: "LIVE" } });
  await logAudit({ actor, action: "auction.poster", entityType: "Season", entityId: season.id, summary: "Removed the auction poster" });
  return NextResponse.json({ ok: true });
}
