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

  // A blob-store failure (bad or expired NETLIFY_API_TOKEN locally, a Netlify
  // outage in production) used to escape as a 500. `next/image` turns any
  // non-2xx upstream into a 400 of its own, so every player card rendered as a
  // broken-image icon with no way for the UI to know. Answering 404 instead
  // lets the callers fall back to the jersey-number badge.
  let blob: { data: ArrayBuffer; metadata: unknown } | null = null;
  try {
    blob = await store.getWithMetadata(key, { type: "arrayBuffer" });
  } catch (error) {
    console.error(`[photos] blob store unavailable for key ${key}:`, error);
    return NextResponse.json({ error: "Photo store unavailable" }, { status: 404 });
  }

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
