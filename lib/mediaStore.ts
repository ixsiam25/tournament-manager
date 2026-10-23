import fs from "node:fs/promises";
import path from "node:path";
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

/**
 * Local development without R2 credentials: files go to `.local-media/` instead
 * (and are served back through `/api/photos/<key>`), so the whole photo flow —
 * apply, cut-out, approval, cards — can be exercised on a laptop. Never active
 * in a production build: there a missing bucket is a real error, not something
 * to paper over.
 */
const LOCAL_DIR = path.join(process.cwd(), ".local-media");
function isLocalStore(): boolean {
  return process.env.NODE_ENV !== "production" && !isMediaStoreConfigured();
}
const localPath = (key: string) => path.join(LOCAL_DIR, encodeURIComponent(key));

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
  if (isLocalStore()) {
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    await fs.writeFile(localPath(key), typeof body === "string" ? body : body instanceof Uint8Array ? body : new Uint8Array(body));
    await fs.writeFile(`${localPath(key)}.type`, contentType);
    return;
  }
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
  if (isLocalStore()) return `/api/photos/${key}`;
  return `https://${process.env.R2_PUBLIC_URL ?? ""}/${key}`;
}

/** Reads an object back; null when the key doesn't exist. Other failures throw. */
export async function getObject(
  key: string,
): Promise<{ data: Uint8Array; contentType: string } | null> {
  if (isLocalStore()) {
    try {
      const [data, type] = await Promise.all([fs.readFile(localPath(key)), fs.readFile(`${localPath(key)}.type`, "utf8").catch(() => "application/octet-stream")]);
      return { data: new Uint8Array(data), contentType: type };
    } catch {
      return null;
    }
  }
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
  if (isLocalStore()) {
    await Promise.all([fs.rm(localPath(key), { force: true }), fs.rm(`${localPath(key)}.type`, { force: true })]);
    return;
  }
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
