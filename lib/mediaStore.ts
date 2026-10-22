import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 (S3-compatible) — the single object store for every upload:
 * player photos, team logos, season media, applicant photos and season
 * archive backups. Public-facing files can be served straight from
 * R2_PUBLIC_URL (a custom domain bound to the bucket), so that bandwidth
 * never touches Netlify; anything that must stay behind app logic is read
 * through `getObject` instead (see `app/api/photos/[key]/route.ts`).
 *
 * The client is built lazily so env vars are read at call time — scripts
 * and tests can load `.env.local` after importing this module.
 */
let cached: S3Client | null = null;

function client(): S3Client {
  if (!cached) {
    cached = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return cached;
}

const bucket = () => process.env.R2_BUCKET_NAME ?? "";

export function isMediaStoreConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );
}

export async function putObject(
  key: string,
  body: ArrayBuffer | Uint8Array | string,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: typeof body === "string" ? body : body instanceof Uint8Array ? body : new Uint8Array(body),
      ContentType: contentType,
    }),
  );
}

/** Uploads and returns the direct public URL (used where the URL is stored in the DB). */
export async function uploadMedia(
  key: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<string> {
  await putObject(key, body, contentType);
  return `https://${process.env.R2_PUBLIC_URL ?? ""}/${key}`;
}

/** Reads an object back; null when the key doesn't exist. Other failures throw. */
export async function getObject(
  key: string,
): Promise<{ data: Uint8Array; contentType: string } | null> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!res.Body) return null;
    return {
      data: await res.Body.transformToByteArray(),
      contentType: res.ContentType ?? "application/octet-stream",
    };
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
