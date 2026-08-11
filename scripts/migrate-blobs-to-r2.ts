// One-time migration: copies every player photo + team logo out of Netlify
// Blobs into Cloudflare R2, then rewrites the DB photoUrl/logoUrl columns to
// the new direct R2 URL. Safe to re-run — already-migrated rows (https://
// URLs) are skipped.
//
// Requires both the old Netlify Blobs vars (NETLIFY_SITE_ID,
// NETLIFY_API_TOKEN) and the new R2 vars (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL) set in .env.local.
//
// Run with: npx tsx scripts/migrate-blobs-to-r2.ts

import fs from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: fs.existsSync(".env.local") ? ".env.local" : ".env" });

import { getStore } from "@netlify/blobs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const required = [
  "NETLIFY_SITE_ID",
  "NETLIFY_API_TOKEN",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const blobStore = getStore({
  name: "player-photos",
  siteID: process.env.NETLIFY_SITE_ID!,
  token: process.env.NETLIFY_API_TOKEN!,
});

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
const BUCKET = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const OLD_PREFIX = "/api/photos/";

function keyFromOldUrl(url: string): string | null {
  if (!url.startsWith(OLD_PREFIX)) return null;
  return url.slice(OLD_PREFIX.length);
}

async function migrateOne(key: string): Promise<string> {
  const blob = await blobStore.getWithMetadata(key, { type: "arrayBuffer" });
  if (!blob) throw new Error(`blob not found for key ${key}`);
  const contentType =
    (blob.metadata as { contentType?: string } | undefined)?.contentType ?? "image/jpeg";

  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: new Uint8Array(blob.data as ArrayBuffer),
      ContentType: contentType,
    })
  );

  return `https://${PUBLIC_URL}/${key}`;
}

async function main() {
  const players = await prisma.player.findMany({
    where: { photoUrl: { not: null } },
    select: { id: true, photoUrl: true },
  });
  const teams = await prisma.team.findMany({
    where: { logoUrl: { not: null } },
    select: { id: true, logoUrl: true },
  });

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const player of players) {
    const key = keyFromOldUrl(player.photoUrl!);
    if (!key) {
      skipped++;
      continue;
    }
    try {
      const newUrl = await migrateOne(key);
      await prisma.player.update({ where: { id: player.id }, data: { photoUrl: newUrl } });
      migrated++;
      console.log(`player ${player.id}: migrated`);
    } catch (err) {
      failed++;
      console.error(`player ${player.id}: FAILED — ${(err as Error).message}`);
    }
  }

  for (const team of teams) {
    const key = keyFromOldUrl(team.logoUrl!);
    if (!key) {
      skipped++;
      continue;
    }
    try {
      const newUrl = await migrateOne(key);
      await prisma.team.update({ where: { id: team.id }, data: { logoUrl: newUrl } });
      migrated++;
      console.log(`team ${team.id}: migrated`);
    } catch (err) {
      failed++;
      console.error(`team ${team.id}: FAILED — ${(err as Error).message}`);
    }
  }

  console.log(`\nDone. migrated=${migrated} skipped(already migrated)=${skipped} failed=${failed}`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main();
