import { prisma } from "@/lib/db";
import { buildSeasonArchive } from "@/lib/seasonArchive";
import { getSeasonArchiveStore } from "@/lib/blobStore";
import type { SeasonFormatConfig } from "@/lib/seasonFormat";

export type PreflightResult = {
  ok: boolean;
  liveMatchCount: number;
  unfinishedMatchCount: number;
  unresolvedDrawCount: number;
};

/** Refuses unless every match is FINISHED, none are LIVE, and any drawn
 * knockout has a `winnerTeamId` set. Only meaningful when there's an
 * active season with matches to check — see `getRolloverStatus`. */
export async function checkPreflight(): Promise<PreflightResult> {
  const [liveMatchCount, unfinishedMatchCount, unresolvedDraws] = await Promise.all([
    prisma.match.count({ where: { status: "LIVE" } }),
    prisma.match.count({ where: { status: { not: "FINISHED" } } }),
    prisma.match.count({
      where: {
        round: { in: ["SEMIFINAL", "FINAL"] },
        status: "FINISHED",
        winnerTeamId: null,
      },
    }),
  ]);
  return {
    ok: liveMatchCount === 0 && unfinishedMatchCount === 0 && unresolvedDraws === 0,
    liveMatchCount,
    unfinishedMatchCount,
    unresolvedDrawCount: unresolvedDraws,
  };
}

export type RolloverStatus = {
  activeSeason: { id: string; number: number; name: string } | null;
  preflight: PreflightResult | null;
  nextSeasonNumber: number;
};

export async function getRolloverStatus(): Promise<RolloverStatus> {
  const [activeSeason, maxSeason] = await Promise.all([
    prisma.season.findFirst({ where: { status: "ACTIVE" }, select: { id: true, number: true, name: true } }),
    prisma.season.aggregate({ _max: { number: true } }),
  ]);

  return {
    activeSeason,
    preflight: activeSeason ? await checkPreflight() : null,
    nextSeasonNumber: (maxSeason._max.number ?? 0) + 1,
  };
}

/** Freezes the current active season — builds the archive, writes it to
 * `Season.resultsJson` and a Blobs copy. Does not touch live tables; that
 * only happens in `openNextSeason`. */
export async function freezeActiveSeason(): Promise<{ seasonId: string; archive: Awaited<ReturnType<typeof buildSeasonArchive>> }> {
  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) throw new Error("No active season to freeze");

  const preflight = await checkPreflight();
  if (!preflight.ok) {
    throw new Error("Preflight failed — every match must be FINISHED and every knockout draw resolved before freezing");
  }

  const archive = await buildSeasonArchive();
  const final = archive.matches.find((m) => m.round === "FINAL");
  const runnerUpTeamName =
    final && archive.championResult
      ? final.homeTeam === archive.championResult.championTeamName
        ? final.awayTeam
        : final.homeTeam
      : null;

  await prisma.season.update({
    where: { id: season.id },
    data: {
      status: "ARCHIVED",
      resultsJson: archive as object,
      championTeamName: archive.championResult?.championTeamName ?? null,
      runnerUpTeamName,
      topScorerName: archive.topScorers[0]?.playerName ?? null,
    },
  });

  const store = getSeasonArchiveStore();
  await store.set(`season-${season.slug}.json`, JSON.stringify(archive, null, 2), {
    metadata: { contentType: "application/json" },
  });

  return { seasonId: season.id, archive };
}

export type OpenSeasonInput = {
  number: number;
  name: string;
  slug: string;
  year: number;
  teamFormation: "BATCH" | "AUCTION";
  targetTeamCount?: number | null;
  squadSizeMin: number;
  squadSizeMax: number;
  registrationSelfServeEnabled: boolean;
  registrationExcelImportEnabled: boolean;
  formatConfig: SeasonFormatConfig;
};

/** Creates the new ACTIVE season and wipes the live Team/Player/Match
 * tables — same tables, same order, as `prisma/seed.ts`'s wipe. Registration
 * and auction rows are season-scoped and cascade-delete with their own
 * Season row, so they're untouched here; only ever the *previous* active
 * season's leftover live rows get cleared. */
export async function openNextSeason(input: OpenSeasonInput): Promise<{ seasonId: string }> {
  const season = await prisma.$transaction(async (tx) => {
    const created = await tx.season.create({
      data: {
        number: input.number,
        name: input.name,
        slug: input.slug,
        year: input.year,
        status: "ACTIVE",
        teamFormation: input.teamFormation,
        targetTeamCount: input.targetTeamCount ?? null,
        squadSizeMin: input.squadSizeMin,
        squadSizeMax: input.squadSizeMax,
        registrationOpen: false,
        registrationSelfServeEnabled: input.registrationSelfServeEnabled,
        registrationExcelImportEnabled: input.registrationExcelImportEnabled,
        formatConfig: input.formatConfig as object,
      },
    });

    await tx.matchEvent.deleteMany();
    await tx.prediction.deleteMany();
    await tx.championPrediction.deleteMany();
    await tx.match.deleteMany();
    await tx.player.deleteMany();
    await tx.team.deleteMany();

    return created;
  });

  return { seasonId: season.id };
}
