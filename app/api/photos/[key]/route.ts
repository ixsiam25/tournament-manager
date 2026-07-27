import { NextRequest, NextResponse } from "next/server";
import { getPhotoStore } from "@/lib/blobStore";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ key: string }> };

/**
 * Streams an uploaded player photo out of Netlify Blobs. Public, no auth —
 * player photos are public content. Each upload gets a fresh random key
 * (see the manager photo upload route), so these responses are safe to
 * cache forever: a replaced photo is a new URL, never a mutated one.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { key } = await params;
  const store = getPhotoStore();
  const blob = await store.getWithMetadata(key, { type: "arrayBuffer" });
  if (!blob) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentType =
    (blob.metadata as { contentType?: string } | undefined)?.contentType ?? "image/jpeg";

  return new NextResponse(blob.data as ArrayBuffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
