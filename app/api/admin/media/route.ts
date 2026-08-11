import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getPhotoStore } from "@/lib/blobStore";

export const dynamic = "force-dynamic";

const MAX_BYTES = 6 * 1024 * 1024; // 6MB — the client already downscales before upload
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VALID_TAGS = new Set(["TROPHY", "ACTION", "TEAM", "CROWD"]);

export async function GET(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const seasonId = request.nextUrl.searchParams.get("seasonId");
  if (!seasonId) return NextResponse.json({ error: "seasonId is required" }, { status: 400 });

  const assets = await prisma.mediaAsset.findMany({ where: { seasonId }, orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ assets });
}

export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const seasonId = formData?.get("seasonId");
  const caption = formData?.get("caption");
  const credit = formData?.get("credit");
  const tag = formData?.get("tag");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (typeof seasonId !== "string" || !seasonId) {
    return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
  }
  if (typeof caption !== "string" || !caption.trim()) {
    return NextResponse.json({ error: "Caption is required" }, { status: 400 });
  }
  if (typeof tag !== "string" || !VALID_TAGS.has(tag)) {
    return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Photo must be JPEG, PNG, or WebP" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Photo is too large" }, { status: 400 });
  }

  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) return NextResponse.json({ error: "Season not found" }, { status: 404 });

  const key = `season-media-${seasonId}-${randomUUID()}`;
  const buffer = await file.arrayBuffer();
  const store = getPhotoStore();
  await store.set(key, buffer, { metadata: { contentType: file.type } });

  const maxSort = await prisma.mediaAsset.aggregate({ where: { seasonId }, _max: { sortOrder: true } });
  const asset = await prisma.mediaAsset.create({
    data: {
      seasonId,
      key,
      contentType: file.type,
      caption: caption.trim(),
      credit: typeof credit === "string" && credit.trim() ? credit.trim() : null,
      tag: tag as "TROPHY" | "ACTION" | "TEAM" | "CROWD",
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  await logAudit({
    actor,
    action: "media.create",
    entityType: "MediaAsset",
    entityId: asset.id,
    summary: `Uploaded a photo to "${season.name}"`,
  });

  return NextResponse.json({ asset }, { status: 201 });
}
