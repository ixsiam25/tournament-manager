/**
 * One-off: creates the `Season` row for BFL Season IX (backfilled after the
 * fact, since Season IX finished before the `Season` model existed) and
 * links every Season IX `Player` to a new `Person`. Idempotent — re-running
 * after a successful run is a no-op (skips if the season row already
 * exists), so it's safe to re-run if it's interrupted partway.
 *
 * Run once via: npx tsx scripts/backfill-season-ix.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../lib/db");
  const { buildSeasonArchive } = await import("../lib/seasonArchive");
  const { getSeasonArchiveStore } = await import("../lib/blobStore");

  const existing = await prisma.season.findUnique({ where: { number: 9 } });
  if (existing) {
    console.log(`Season IX already backfilled (id ${existing.id}) — nothing to do.`);
    return;
  }

  const archive = await buildSeasonArchive();

  const final = archive.matches.find((m) => m.round === "FINAL");
  const runnerUpTeamName =
    final && archive.championResult
      ? final.homeTeam === archive.championResult.championTeamName
        ? final.awayTeam
        : final.homeTeam
      : null;
  const firstKickoff = archive.matches
    .map((m) => m.scheduledAt)
    .filter((d): d is string => !!d)
    .sort()[0];
  const lastFinish = archive.matches
    .map((m) => m.finishedAt)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  const season = await prisma.season.create({
    data: {
      number: 9,
      name: "BFL Season IX",
      slug: "ix",
      year: 2026,
      status: "ARCHIVED",
      teamFormation: "BATCH",
      startsOn: firstKickoff ? new Date(firstKickoff) : undefined,
      endsOn: lastFinish ? new Date(lastFinish) : undefined,
      championTeamName: archive.championResult?.championTeamName ?? null,
      runnerUpTeamName,
      topScorerName: archive.topScorers[0]?.playerName ?? null,
      resultsJson: archive as object,
    },
  });
  console.log(`Created Season row ${season.id} for Season IX.`);

  const store = getSeasonArchiveStore();
  await store.set(`season-${season.slug}.json`, JSON.stringify(archive, null, 2), {
    metadata: { contentType: "application/json" },
  });
  console.log(`Wrote season-${season.slug}.json to the season-archives Blobs store.`);

  const players = await prisma.player.findMany({ where: { personId: null } });
  let linked = 0;
  for (const player of players) {
    const person = await prisma.person.create({ data: { name: player.name } });
    await prisma.player.update({ where: { id: player.id }, data: { personId: person.id } });
    linked++;
  }
  console.log(`Backfilled ${linked} Person record(s) and linked them to their Player rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
