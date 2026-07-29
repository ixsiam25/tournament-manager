import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/managerAuth";
import { getPhotoStore } from "@/lib/blobStore";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // 4MB — the client already downscales before upload
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  const result = await requireManager();
  if (result instanceof NextResponse) return result;
  const { teamId } = result;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No logo provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Logo must be JPEG, PNG, or WebP" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Logo is too large" }, { status: 400 });
  }

  // Fresh key per upload (not keyed by teamId) so the served URL changes
  // every time a logo is replaced — that's what makes the `immutable`
  // cache header on the serving route safe.
  const key = `team-${teamId}-${randomUUID()}`;
  const buffer = await file.arrayBuffer();
  const store = getPhotoStore();
  await store.set(key, buffer, { metadata: { contentType: file.type } });

  const logoUrl = `/api/photos/${key}`;
  const team = await prisma.team.update({ where: { id: teamId }, data: { logoUrl } });

  return NextResponse.json({ team });
}
