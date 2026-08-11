/**
 * One-off correction: `buildSeasonArchive()` didn't include `personId` on
 * players/topScorers/topAssists when the Season IX row was first created
 * (Stage 1, before `/legacy/hall-of-fame`'s need for it was designed) —
 * this rebuilds and overwrites just `resultsJson` with the corrected
 * shape. Every other field (scores, standings, events) is unchanged; safe
 * to run before the archive has been publicly displayed anywhere.
 *
 * Run via: npx tsx scripts/refresh-season-ix-archive.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../lib/db");
  const { buildSeasonArchive } = await import("../lib/seasonArchive");
  const { getSeasonArchiveStore } = await import("../lib/blobStore");

  const season = await prisma.season.findUnique({ where: { number: 9 } });
  if (!season) throw new Error("Season IX row not found");

  const archive = await buildSeasonArchive();
  await prisma.season.update({ where: { id: season.id }, data: { resultsJson: archive as object } });
  console.log(`Refreshed resultsJson for Season row ${season.id}.`);

  const store = getSeasonArchiveStore();
  await store.set(`season-${season.slug}.json`, JSON.stringify(archive, null, 2), {
    metadata: { contentType: "application/json" },
  });
  console.log(`Rewrote season-${season.slug}.json in the season-archives Blobs store.`);

  const withPersonId = archive.players.filter((p) => p.personId).length;
  console.log(`${withPersonId} / ${archive.players.length} players now carry personId.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
