import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 (S3-compatible). Files are served directly from
 * R2_PUBLIC_URL (a custom domain bound to the bucket in the Cloudflare
 * dashboard) — the browser never hits Netlify for photo/video bytes, so it
 * doesn't count against Netlify's bandwidth credits.
 */
const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

const BUCKET = process.env.R2_BUCKET_NAME ?? "";
const PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";

export async function uploadMedia(
  key: string,
  body: ArrayBuffer,
  contentType: string
): Promise<string> {
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: new Uint8Array(body),
      ContentType: contentType,
    })
  );
  return `https://${PUBLIC_URL}/${key}`;
}
