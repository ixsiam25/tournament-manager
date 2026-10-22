import { NextRequest, NextResponse } from "next/server";
import { getObject } from "@/lib/mediaStore";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ key: string }> };

/**
 * Streams an uploaded photo out of R2. Public, no auth — these are public
 * content (season media, applicant photos shown to admins by unguessable
 * key). Each upload gets a fresh random key, so responses are safe to cache
 * forever: a replaced photo is a new URL, never a mutated one.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { key } = await params;

  // A store failure (missing R2 credentials locally, a Cloudflare outage)
  // used to escape as a 500. `next/image` turns any non-2xx upstream into a
  // 400 of its own, so every photo rendered as a broken-image icon with no
  // way for the UI to know. Answering 404 lets callers fall back to initials.
  let object: Awaited<ReturnType<typeof getObject>> = null;
  try {
    object = await getObject(key);
  } catch (error) {
    console.error(`[photos] object store unavailable for key ${key}:`, error);
    return NextResponse.json({ error: "Photo store unavailable" }, { status: 404 });
  }

  if (!object) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(object.data as BodyInit, {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
