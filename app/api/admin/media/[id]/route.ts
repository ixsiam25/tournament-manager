import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getPhotoStore } from "@/lib/blobStore";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const VALID_TAGS = new Set(["TROPHY", "ACTION", "TEAM", "CROWD"]);

export async function PATCH(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const before = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const data: { caption?: string; credit?: string | null; tag?: "TROPHY" | "ACTION" | "TEAM" | "CROWD"; sortOrder?: number; isHero?: boolean } = {};

  if (body?.caption !== undefined) {
    if (typeof body.caption !== "string" || !body.caption.trim()) {
      return NextResponse.json({ error: "Caption is required" }, { status: 400 });
    }
    data.caption = body.caption.trim();
  }
  if (body?.credit !== undefined) {
    data.credit = typeof body.credit === "string" && body.credit.trim() ? body.credit.trim() : null;
  }
  if (body?.tag !== undefined) {
    if (typeof body.tag !== "string" || !VALID_TAGS.has(body.tag)) {
      return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
    }
    data.tag = body.tag;
  }
  if (body?.sortOrder !== undefined) {
    if (typeof body.sortOrder !== "number") {
      return NextResponse.json({ error: "Invalid sortOrder" }, { status: 400 });
    }
    data.sortOrder = body.sortOrder;
  }
  if (body?.isHero !== undefined) {
    if (typeof body.isHero !== "boolean") {
      return NextResponse.json({ error: "Invalid isHero" }, { status: 400 });
    }
    data.isHero = body.isHero;
  }

  // Only one hero per season — unset every other asset's hero flag first
  // when this one is being starred.
  const asset = await prisma.$transaction(async (tx) => {
    if (data.isHero === true) {
      await tx.mediaAsset.updateMany({
        where: { seasonId: before.seasonId, id: { not: id } },
        data: { isHero: false },
      });
    }
    return tx.mediaAsset.update({ where: { id }, data });
  });

  await logAudit({
    actor,
    action: "media.update",
    entityType: "MediaAsset",
    entityId: id,
    summary: `Updated a photo (${Object.keys(data).join(", ") || "no changes"})`,
    before,
    after: asset,
  });

  return NextResponse.json({ asset });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const { id } = await params;
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.mediaAsset.delete({ where: { id } });
  // Best-effort — an orphaned blob is a minor storage cost, not worth
  // failing the delete over if this errors.
  await getPhotoStore()
    .delete(asset.key)
    .catch((error) => console.error("Failed to delete media blob:", error));

  await logAudit({
    actor,
    action: "media.delete",
    entityType: "MediaAsset",
    entityId: id,
    summary: `Deleted a photo: "${asset.caption}"`,
    before: asset,
  });

  return NextResponse.json({ ok: true });
}
